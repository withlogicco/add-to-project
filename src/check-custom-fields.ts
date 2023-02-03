import * as core from '@actions/core'

interface ObjectType {
  [key: string]: string
}

interface OptionType {
  id: string
  name: string
}

interface ArrayType {
  options: OptionType[]
  name: string
  dataType: string
  id: string
}

export async function checkDictionaryInArray(obj: {[key: string]: string}, arr: []) {
  const object: ObjectType = obj
  const array: ArrayType[] = arr

  const result = []

  //remove empty objects from array of objects
  const filteredArray = array.filter(objs => !(objs && Object.keys(objs).length === 0 && objs.constructor === Object))

  for (const key in object) {
    const found = filteredArray.find(item => item.name.toLowerCase() === key.toLowerCase())

    if (found && found.dataType) {
      // TODO: Add support for other data types (e.g. ITERATIONS)
      switch (found.dataType) {
        case 'SINGLE_SELECT':
          const optionFound = found.options.find(option => option.name.toLowerCase() === object[key].toLowerCase())

          if (optionFound) {
            const id = found.id
            const value = optionFound.id
            result.push({id, value: {singleSelectOptionId: value}})
          }
          break

        case 'TEXT':
          const textId = found.id
          const textValue = found.name
          result.push({id: textId, value: {textValueName: textValue}})
          break

        case 'NUMBER':
          const numberId = found.id
          const numberValue = found.name
          result.push({id: numberId, value: {numberValue}})
          break

        default:
          core.debug(`Unsupported data type: ${found.dataType}`)
          break
      }
    }
  }
  core.debug(`Result: ${JSON.stringify(result)}`)
  return result
}

export const JSON_OBJECT = {
  url: 'https://api.github.com/repos/withlogicco/vaulty/issues/1',
  repository_url: 'https://api.github.com/repos/withlogicco/vaulty',
  labels_url: 'https://api.github.com/repos/withlogicco/vaulty/issues/1/labels{/name}',
  comments_url: 'https://api.github.com/repos/withlogicco/vaulty/issues/1/comments',
  events_url: 'https://api.github.com/repos/withlogicco/vaulty/issues/1/events',
  html_url: 'https://github.com/withlogicco/vaulty/issues/1',
  id: 842992168,
  node_id: 'MDU6SXNzdWU4NDI5OTIxNjg=',
  number: 1,
  title: 'Create a base Django project',
  user: {
    login: 'akalipetis',
    id: 788386,
    node_id: 'MDQ6VXNlcjc4ODM4Ng==',
    avatar_url: 'https://avatars.githubusercontent.com/u/788386?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/akalipetis',
    html_url: 'https://github.com/akalipetis',
    followers_url: 'https://api.github.com/users/akalipetis/followers',
    following_url: 'https://api.github.com/users/akalipetis/following{/other_user}',
    gists_url: 'https://api.github.com/users/akalipetis/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/akalipetis/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/akalipetis/subscriptions',
    organizations_url: 'https://api.github.com/users/akalipetis/orgs',
    repos_url: 'https://api.github.com/users/akalipetis/repos',
    events_url: 'https://api.github.com/users/akalipetis/events{/privacy}',
    received_events_url: 'https://api.github.com/users/akalipetis/received_events',
    type: 'User',
    site_admin: false,
  },
  labels: [],
  state: 'closed',
  locked: false,
  assignee: null,
  assignees: [],
  milestone: null,
  comments: 1,
  created_at: '2021-03-29T05:43:44Z',
  updated_at: '2021-03-31T07:57:15Z',
  closed_at: '2021-03-31T07:57:15Z',
  author_association: 'CONTRIBUTOR',
  active_lock_reason: null,
  body: 'Requirements:\r\n* Black formatted\r\n* [Sec](https://pypi.org/project/sec/) to be used for loading configuration variables (like `SECRET_KEY`)\r\n* Tests to be run on every push (not only PRs)\r\n* Black to be checked on every push\r\n* Poetry for dependency management\r\n* Postgres as the default database\r\n* Postgres [database URL](https://pypi.org/project/dj-database-url/) got from `DATABASE_URL` key using sec, defaulting to `postgres://user:password@localhost:5432/sec-share`\r\n* [Postgres database service running in Github actions](https://docs.github.com/en/actions/guides/about-service-containers#creating-service-containers)',
  closed_by: {
    login: 'marcelom97',
    id: 33069337,
    node_id: 'MDQ6VXNlcjMzMDY5MzM3',
    avatar_url: 'https://avatars.githubusercontent.com/u/33069337?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/marcelom97',
    html_url: 'https://github.com/marcelom97',
    followers_url: 'https://api.github.com/users/marcelom97/followers',
    following_url: 'https://api.github.com/users/marcelom97/following{/other_user}',
    gists_url: 'https://api.github.com/users/marcelom97/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/marcelom97/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/marcelom97/subscriptions',
    organizations_url: 'https://api.github.com/users/marcelom97/orgs',
    repos_url: 'https://api.github.com/users/marcelom97/repos',
    events_url: 'https://api.github.com/users/marcelom97/events{/privacy}',
    received_events_url: 'https://api.github.com/users/marcelom97/received_events',
    type: 'User',
    site_admin: false,
  },
  reactions: {
    url: 'https://api.github.com/repos/withlogicco/vaulty/issues/1/reactions',
    total_count: 0,
    '+1': 0,
    '-1': 0,
    laugh: 0,
    hooray: 0,
    confused: 0,
    heart: 0,
    rocket: 0,
    eyes: 0,
  },
  timeline_url: 'https://api.github.com/repos/withlogicco/vaulty/issues/1/timeline',
  performed_via_github_app: null,
  state_reason: 'completed',
}