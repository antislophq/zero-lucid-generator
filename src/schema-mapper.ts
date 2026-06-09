import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { RelationshipsContract } from '@adonisjs/lucid/types/relations'
import { isTsTypeOptional, mapTsTypeToZero } from './lucid-to-zero.js'
import { buildTsProject, extractColumnTypesFromSource, toCamelCase } from './source-loader.js'
import type {
  ResolvedConfig,
  TransformedSchema,
  ZeroModel,
  ZeroRelationship,
  ZeroRelationshipLink,
  ZeroTypeMapping,
} from './types.js'

// ----------------------------------------------------------------
// Naming helpers
// ----------------------------------------------------------------

/**
 * Converts a PascalCase model class name to the Zero table const name.
 * e.g. "User" → "userTable", "IssueLabel" → "issueLabelTable"
 */
export function toZeroTableName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1) + 'Table'
}

/**
 * Converts a model class name to the Zero relationships const name.
 * e.g. "User" → "userTableRelationships"
 */
export function toZeroRelationshipsName(modelName: string): string {
  return toZeroTableName(modelName) + 'Relationships'
}

// ----------------------------------------------------------------
// Column mapping
// ----------------------------------------------------------------

export { mapColumns, mapRelations }

function mapColumns(
  model: LucidModel,
  columnTypeOverrides: Record<string, string> | undefined,
  tsColumnTypes: Map<string, string>,
): Record<string, ZeroTypeMapping> {
  const columns: Record<string, ZeroTypeMapping> = {}

  for (const [attributeName, columnOptions] of model.$columnsDefinitions) {
    const dbColumnName = columnOptions.columnName
    const mappedName = dbColumnName !== attributeName ? dbColumnName : null

    let zeroType: string
    let isOptional = false

    if (columnTypeOverrides?.[attributeName]) {
      zeroType = columnTypeOverrides[attributeName]!
      // Still infer optionality from the source type even when the Zero type is overridden
      const tsType = tsColumnTypes.get(attributeName)
      if (tsType) isOptional = isTsTypeOptional(tsType)
    } else {
      const tsType = tsColumnTypes.get(attributeName)
      if (tsType) {
        zeroType = mapTsTypeToZero(tsType)
        isOptional = isTsTypeOptional(tsType)
      } else {
        console.warn(
          `lucid-zero: Could not infer Zero type for ${model.name}.${attributeName}. Falling back to json(). Add a columnTypes override if this is wrong.`,
        )
        zeroType = 'json()'
      }
    }

    if (columnOptions.isPrimary) {
      isOptional = false
    }

    columns[attributeName] = { type: zeroType, isOptional, mappedName }
  }

  return columns
}

// ----------------------------------------------------------------
// Relation mapping
// ----------------------------------------------------------------

function mapRelations(
  model: LucidModel,
  allModels: LucidModel[],
): Record<string, ZeroRelationship> {
  const relationships: Record<string, ZeroRelationship> = {}

  for (const [relationName, relation] of model.$relationsDefinitions) {
    try {
      relation.boot()
    } catch (err) {
      console.warn(
        `lucid-zero: Skipping relation "${relationName}" on ${model.name} — boot() failed: ${String(err)}`,
      )
      continue
    }

    const rel = relation as RelationshipsContract & {
      type: string
      localKey: string
      foreignKey: string
      relatedModel: () => LucidModel
      pivotTable?: string
      pivotForeignKey?: string
      pivotRelatedForeignKey?: string
      relatedKey?: string
    }

    const relatedModel = rel.relatedModel()
    const relatedZeroTable = toZeroTableName(relatedModel.name)

    const relatedIncluded = allModels.some((m) => m.name === relatedModel.name)
    if (!relatedIncluded) {
      console.info(
        `lucid-zero: Skipping relation "${relationName}" on ${model.name} — ${relatedModel.name} was not found in modelsSourcePath.`,
      )
      continue
    }

    switch (rel.type) {
      case 'hasOne':
        relationships[relationName] = {
          type: 'one',
          sourceField: [rel.localKey],
          destField: [rel.foreignKey],
          destSchema: relatedZeroTable,
        }
        break

      case 'belongsTo':
        relationships[relationName] = {
          type: 'one',
          sourceField: [rel.foreignKey],
          destField: [rel.localKey],
          destSchema: relatedZeroTable,
        }
        break

      case 'hasMany':
        relationships[relationName] = {
          type: 'many',
          sourceField: [rel.localKey],
          destField: [rel.foreignKey],
          destSchema: relatedZeroTable,
        }
        break

      case 'manyToMany': {
        if (!rel.pivotTable || !rel.pivotForeignKey || !rel.pivotRelatedForeignKey) {
          console.warn(
            `lucid-zero: Skipping manyToMany relation "${relationName}" on ${model.name} — pivot table fields could not be resolved after boot().`,
          )
          break
        }

        const pivotZeroTable = toZeroTableName(rel.pivotTable)
        const link1: ZeroRelationshipLink = {
          sourceField: [rel.localKey],
          destField: [rel.pivotForeignKey],
          destSchema: pivotZeroTable,
        }
        const link2: ZeroRelationshipLink = {
          sourceField: [rel.pivotRelatedForeignKey],
          destField: [rel.relatedKey ?? relatedModel.primaryKey],
          destSchema: relatedZeroTable,
        }

        relationships[relationName] = { type: 'many', chain: [link1, link2] }
        break
      }

      case 'hasManyThrough': {
        const throughRel = rel as typeof rel & {
          throughLocalKey?: string
          throughForeignKey?: string
          throughModel: () => LucidModel
        }

        if (!throughRel.throughModel) {
          console.warn(
            `lucid-zero: Skipping hasManyThrough relation "${relationName}" on ${model.name} — throughModel could not be resolved after boot().`,
          )
          break
        }

        const throughModel = throughRel.throughModel()
        const throughZeroTable = toZeroTableName(throughModel.name)

        const link1: ZeroRelationshipLink = {
          sourceField: [rel.localKey],
          destField: [rel.foreignKey],
          destSchema: throughZeroTable,
        }
        const link2: ZeroRelationshipLink = {
          sourceField: [throughRel.throughLocalKey ?? throughModel.primaryKey],
          destField: [throughRel.throughForeignKey ?? relatedModel.primaryKey],
          destSchema: relatedZeroTable,
        }

        relationships[relationName] = { type: 'many', chain: [link1, link2] }
        break
      }
    }
  }

  return relationships
}

// ----------------------------------------------------------------
// Main transform
// ----------------------------------------------------------------

export function transformSchema(config: ResolvedConfig, tsConfigPath?: string): TransformedSchema {
  const project = buildTsProject(tsConfigPath)

  const models: ZeroModel[] = config.models.map((model) => {
    const tsColumnTypes = extractColumnTypesFromSource(model, project)
    const columnOverrides = config.columnTypes?.[model.name]

    const dbTableName = model.table
    const zeroTableName = config.camelCase ? toCamelCase(dbTableName) : dbTableName
    const shouldRemap = zeroTableName !== dbTableName

    return {
      tableName: zeroTableName,
      originalTableName: shouldRemap ? dbTableName : null,
      modelName: model.name,
      zeroTableName: toZeroTableName(model.name),
      columns: mapColumns(model, columnOverrides, tsColumnTypes),
      relationships: mapRelations(model, config.models),
      primaryKey: [model.primaryKey],
    }
  })

  return { models }
}
