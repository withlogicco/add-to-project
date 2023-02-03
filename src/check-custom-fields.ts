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
