import * as core from '@actions/core'
import * as github from '@actions/github'
import * as utils from './utils'

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
  updateProjectV2ItemFieldValue: {
    projectV2Item: {
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
  const projectUrl = core.getInput('project-url', { required: true })
  const ghToken = core.getInput('github-token', { required: true })
  const fields = core.getMultilineInput('fields', { required: false })
  const labeled =
    core
      .getInput('labeled')
      .split(',')
      .map(l => l.trim().toLowerCase())
      .filter(l => l.length > 0) ?? []
  const labelOperator = core.getInput('label-operator').trim().toLocaleLowerCase()

  const octokit = github.getOctokit(ghToken)

  const issue = github.context.payload.issue ?? github.context.payload.pull_request
  const issueLabels: string[] = (issue?.labels ?? []).map((l: { name: string }) => l.name.toLowerCase())
  const issueOwnerName = github.context.payload.repository?.owner.login

  core.debug(`Issue/PR owner: ${issueOwnerName}`)
  core.debug(`Issue/PR labels: ${issueLabels.join(', ')}`)

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

  // Next, use the GraphQL API to add the issue to the project.
  // If the issue has the same owner as the project, we can directly
  // add a project item. Otherwise, we add a draft issue.
  let itemId = ''
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

  if (!fields.length) {
    return
  }

  // Next, use the GraphQL API to request the project's fields using the node ID.
  const fieldsResp = await octokit.graphql<ProjectFieldsResponse>(
    `query getProjectFields($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                dataType
                name
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
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

  const fieldsObj: { [key: string]: string } = {}

  fields.forEach(str => {
    const [key, value] = str.split('=')
    if (!key || !value) {
      throw new Error(`Invalid field ${str}. The field should be in the format of key=value.`)
    }
    fieldsObj[key] = value
  })

  const results = await utils.getFieldUpdates(fieldsObj, projectFields)

  // update the project with the custom fields
  for (const result of results) {
    const updateResp = await octokit.graphql<ProjectUpdateItemResponse>(
      `mutation UpdateFieldValue($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) {
          projectV2Item {
            id
          }
        }
      }`,
      {
        input: {
          projectId,
          itemId,
          fieldId: result.id,
          value: result.value,
        },
      },
    )
  }
}

export function mustGetOwnerTypeQuery(ownerType?: string): 'organization' | 'user' {
  const ownerTypeQuery = ownerType === 'orgs' ? 'organization' : ownerType === 'users' ? 'user' : null

  if (!ownerTypeQuery) {
    throw new Error(`Unsupported ownerType: ${ownerType}. Must be one of 'orgs' or 'users'`)
  }

  return ownerTypeQuery
}
