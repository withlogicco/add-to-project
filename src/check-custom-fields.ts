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
  value: string
  id: string
}

export async function checkDictionaryInArray(obj: {[key: string]: string}, arr: []) {
  const object: ObjectType = obj
  const array: ArrayType[] = arr

  const result = []

  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      const found = array.find(item => item.name.toLowerCase() === key.toLowerCase())

      if (found && found.options) {
        const optionFound = found.options.find(option => option.name.toLocaleLowerCase() === object[key].toLowerCase())
        if (optionFound) {
          const id = found.id
          const value = optionFound.id
          result.push({id, value: {singleSelectOptionId: value}})
        }
      }
    }
  }
  core.debug(`Result: ${JSON.stringify(result)}`)
  return result
}
