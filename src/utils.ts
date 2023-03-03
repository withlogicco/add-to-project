import * as core from '@actions/core'

interface OptionType {
  id: string
  name: string
}

interface ProjectFieldsType {
  options: OptionType[]
  name: string
  dataType: string
  id: string
}

/**
 * Returns an array of field updates for the GraphQL API
 
 * @param fieldValues
 * @param projectFields
 * @returns {Promise<[]>}
*/

export async function getFieldUpdates(fieldValues: {[key: string]: string}, projectFields: []) {
  const array: ProjectFieldsType[] = projectFields

  const result = []

  //remove empty objects from array of objects
  const isNotEmpty = (objs: Record<string, any>) =>
    !(objs && Object.keys(objs).length === 0 && objs.constructor === Object)
  const clearedProjectFields = array.filter(isNotEmpty)

  for (const [fieldName, fieldValue] of Object.entries(fieldValues)) {
    const foundField = clearedProjectFields.find(
      projectField => projectField.name.toLowerCase() === fieldName.toLowerCase(),
    )

    if (!foundField?.dataType) {
      core.warning(`Could not find field with name ${fieldName}`)
      continue
    }
    // TODO: Add support for other data types (e.g. ITERATIONS)
    switch (foundField.dataType) {
      case 'SINGLE_SELECT':
        const optionFound = foundField.options.find(option => option.name.toLowerCase() === fieldValue.toLowerCase())

        if (!optionFound) {
          core.warning(`Could not find option for field ${foundField.name} with value ${fieldValue}`)
          continue
        }
        const id = foundField.id
        const value = optionFound.id
        result.push({id, value: {singleSelectOptionId: value}})
        continue

      case 'TEXT':
        const textId = foundField.id
        const textValue = foundField.name
        result.push({id: textId, value: {textValueName: textValue}})
        continue

      case 'NUMBER':
        const numberId = foundField.id
        const numberValue = foundField.name
        result.push({id: numberId, value: {numberValue}})
        continue

      default:
        core.warning(`Unsupported data type for field ${fieldName}: ${foundField.dataType}`)
        continue
    }
  }
  return result
}
