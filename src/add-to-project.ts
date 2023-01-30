import * as core from '@actions/core'
import * as github from '@actions/github'
import * as check from './check-custom-fields'

// TODO: Ensure this (and the Octokit client) works for non-github.com URLs, as well.
// https://github.com/orgs|users/<ownerName>/projects/<projectNumber>
const urlParse =
  /^(?:https:\/\/)?github\.com\/(?<ownerType>orgs|users)\/(?<ownerName>[^/]+)\/projects\/(?<projectNumber>\d+)/

interface ProjectNodeIDResponse {
  organization?: {
    projectV2: {
      id: string
      fields: string
    }
  }

  user?: {
    projectV2: {
      id: string
      fields: string
    }
  }
}

interface ProjectAddItemResponse {
  addProjectV2ItemById: {
    item: {
      id: string
    }
  }
}

interface ProjectUpdateItemResponse {
  updateProjectV2ItemById: {
    item: {
      id: string
    }
  }
}

interface ProjectFieldsResponse {
  node: {
    id: string
    fields: {
      nodes: []
    }
  }
}

interface ProjectV2AddDraftIssueResponse {
  addProjectV2DraftIssue: {
    projectItem: {
      id: string
    }
  }
}

export async function addToProject(): Promise<void> {
  const projectUrl = core.getInput('project-url', {required: true})
  const ghToken = core.getInput('github-token', {required: true})
  const fields = core.getInput('fields', {required: true})
  const fieldsObj = fields.split('\n').reduce((acc, f) => {
    const [key, value] = f.split('=').map(s => s.trim())
    acc[key.toLowerCase()] = value.toLowerCase()
    return acc
  }, {} as {[key: string]: string})

  const labeled =
    core
      .getInput('labeled')
      .split(',')
      .map(l => l.trim().toLowerCase())
      .filter(l => l.length > 0) ?? []
  const labelOperator = core.getInput('label-operator').trim().toLocaleLowerCase()

  const octokit = github.getOctokit(ghToken)

  const issue = github.context.payload.issue ?? github.context.payload.pull_request
  const issueLabels: string[] = (issue?.labels ?? []).map((l: {name: string}) => l.name.toLowerCase())
  const issueOwnerName = github.context.payload.repository?.owner.login

  core.debug(`Issue/PR owner: ${issueOwnerName}`)

  // Ensure the issue matches our `labeled` filter based on the label-operator.
  if (labelOperator === 'and') {
    if (!labeled.every(l => issueLabels.includes(l))) {
      core.info(`Skipping issue ${issue?.number} because it doesn't match all the labels: ${labeled.join(', ')}`)
      return
    }
  } else if (labelOperator === 'not') {
    if (labeled.length > 0 && issueLabels.some(l => labeled.includes(l))) {
      core.info(`Skipping issue ${issue?.number} because it contains one of the labels: ${labeled.join(', ')}`)
      return
    }
  } else {
    if (labeled.length > 0 && !issueLabels.some(l => labeled.includes(l))) {
      core.info(`Skipping issue ${issue?.number} because it does not have one of the labels: ${labeled.join(', ')}`)
      return
    }
  }

  core.debug(`Project URL: ${projectUrl}`)

  const urlMatch = projectUrl.match(urlParse)

  if (!urlMatch) {
    throw new Error(
      `Invalid project URL: ${projectUrl}. Project URL should match the format https://github.com/<orgs-or-users>/<ownerName>/projects/<projectNumber>`,
    )
  }

  const projectOwnerName = urlMatch.groups?.ownerName
  const projectNumber = parseInt(urlMatch.groups?.projectNumber ?? '', 10)
  const ownerType = urlMatch.groups?.ownerType
  const ownerTypeQuery = mustGetOwnerTypeQuery(ownerType)

  core.debug(`Project owner: ${projectOwnerName}`)
  core.debug(`Project number: ${projectNumber}`)
  core.debug(`Project owner type: ${ownerType}`)

  // First, use the GraphQL API to request the project's node ID.
  const idResp = await octokit.graphql<ProjectNodeIDResponse>(
    `query getProject($projectOwnerName: String!, $projectNumber: Int!) {
      ${ownerTypeQuery}(login: $projectOwnerName) {
        projectV2(number: $projectNumber) {
          id
        }
      }
    }`,
    {
      projectOwnerName,
      projectNumber,
    },
  )

  const projectId = idResp[ownerTypeQuery]?.projectV2.id
  const contentId = issue?.node_id

  core.debug(`Project node ID: ${projectId}`)
  core.debug(`Content ID: ${contentId}`)

  // Next, use the GraphQL API to request the project's fields using the node ID.
  const fieldsResp = await octokit.graphql<ProjectFieldsResponse>(
    `query getProjectFields($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                name
              }
              ... on ProjectV2IterationField {
                id
                name
                configuration {
                  iterations {
                    startDate
                    id
                  }
                }
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }`,
    {
      projectId,
    },
  )

  const projectFields = fieldsResp.node?.fields.nodes ?? []

  const results = check.checkDictionaryInArray(fieldsObj, projectFields)
  let itemId = ''

  // Next, use the GraphQL API to add the issue to the project.
  // If the issue has the same owner as the project, we can directly
  // add a project item. Otherwise, we add a draft issue.
  if (issueOwnerName === projectOwnerName) {
    core.info('Creating project item')

    const addResp = await octokit.graphql<ProjectAddItemResponse>(
      `mutation addIssueToProject($input: AddProjectV2ItemByIdInput!) {
        addProjectV2ItemById(input: $input) {
          item {
            id
          }
        }
      }`,
      {
        input: {
          projectId,
          contentId,
        },
      },
    )

    core.setOutput('itemId', addResp.addProjectV2ItemById.item.id)
    itemId = addResp.addProjectV2ItemById.item.id
  } else {
    core.info('Creating draft issue in project')

    const addResp = await octokit.graphql<ProjectV2AddDraftIssueResponse>(
      `mutation addDraftIssueToProject($projectId: ID!, $title: String!) {
        addProjectV2DraftIssue(input: {
          projectId: $projectId,
          title: $title
        }) {
          projectItem {
            id
          }
        }
      }`,
      {
        projectId,
        title: issue?.html_url,
      },
    )

    core.setOutput('itemId', addResp.addProjectV2DraftIssue.projectItem.id)
    itemId = addResp.addProjectV2DraftIssue.projectItem.id
  }

  // update the project with the custom fields
  for (const [key, value] of Object.entries(results)) {
    const updateResp = await octokit.graphql<ProjectUpdateItemResponse>(
      `mutation updateProjectItem($input: UpdateProjectV2ItemInput!) {
          updateProjectV2Item(
            input: {
              projectId: $projectId,
              itemId: $itemId,
              fieldId: $fieldId,
              value: $value
          )
        }`,
      {
        input: {
          projectId,
          itemId,
          fieldId: key,
          value,
        },
      },
    )

    core.setOutput('itemId', updateResp.updateProjectV2ItemById.item.id)
  }
}

export function mustGetOwnerTypeQuery(ownerType?: string): 'organization' | 'user' {
  const ownerTypeQuery = ownerType === 'orgs' ? 'organization' : ownerType === 'users' ? 'user' : null

  if (!ownerTypeQuery) {
    throw new Error(`Unsupported ownerType: ${ownerType}. Must be one of 'orgs' or 'users'`)
  }

  return ownerTypeQuery
}
