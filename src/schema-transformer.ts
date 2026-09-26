import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Config } from './config.js'
import type { ClassDeclaration } from 'ts-morph'
import { Project } from 'ts-morph'

export type TransformedSchema = {
  models: ZeroModel[]
}

export type ZeroModel = {
  tableName: string
  columns: Record<string, ZeroColumnProperties>
  relationships: Record<string, ZeroRelationshipProperties>
  primaryKey: string[]
}

export type ZeroColumnProperties = {
  type: string
  isOptional: boolean
}

export type ZeroRelationshipProperties =
  | { type: 'one' | 'many'; sourceField: string[]; destinationField: string[]; destinationTable: string }
  | { type: 'many'; chain: ZeroRelationshipLink[] }

export type ZeroRelationshipLink = {
  sourceField: string[]
  destinationField: string[]
  // Should be the variable name of zero table definition
  destinationTable: string
}

const typesToZeroTypes: Record<string, string> = {
  string: 'string()',
  number: 'number()',
  boolean: 'boolean()',
  // Lucid date columns are typed as Luxon DateTime
  DateTime: 'number()',
  // Plain JS Date falls back to number (epoch ms)
  Date: 'number()',
  // Catch-all for object/unknown shapes
  object: 'json()',
  unknown: 'json()',
  any: 'json()',
}

export default class SchemaTransformer {
  private config: Config
  private project: Project

  constructor(config: Config, tsconfigPath?: string) {
    this.config = config
    this.project = new Project({ tsConfigFilePath: tsconfigPath ?? 'tsconfig.json' })
  }

  public transform(): TransformedSchema {
    return {
      models: this.config.models.map((model) => {
        const columnNameAndTypePairs = this.extractColumnNameAndType(model)
        const columnOverrides = this.config.columnTypeOverrides?.[model.name]

        return {
          tableName: model.table,
          columns: this.mapColumns(columnNameAndTypePairs, columnOverrides, model),
          relationships: this.mapRelations(model, this.config.models),
          primaryKey: [model.primaryKey],
        }
      }),
    }
  }

  // Lucid Model does not offer the type of the columns, so we need to extract it from the source code
  private extractColumnNameAndType(model: LucidModel): Map<string, string> {
    const columnNameAndType = new Map<string, string>()

    const modelSourceFile = this.project.getSourceFiles().find((sourceFile) => {
      return sourceFile.getClass(model.name)?.getName() === model.name
    })

    // This is never hit; here just for defense
    if (!modelSourceFile) {
      throw new Error(
        `Could not find source file for model ${model.name} in ${this.project
          .getSourceFiles()
          .map((sourceFile) => sourceFile.getFilePath())
          .join(', ')}`,
      )
    }

    const classDeclaration = modelSourceFile.getClass(model.name)

    if (!classDeclaration) {
      throw new Error(`Could not find class declaration for model ${model.name}`)
    }

    let currentClass: ClassDeclaration | undefined = classDeclaration

    // Walk up the inheritance chain — derived class properties win
    while (currentClass) {
      for (const property of currentClass.getProperties()) {
        const attributeName = property.getName()

        if (!model.$columnsDefinitions.has(attributeName)) continue
        if (columnNameAndType.has(attributeName)) continue

        // Prefer the explicit annotation; fall back to compiler-inferred type
        const explicitPropertyType = property.getTypeNode()
        if (explicitPropertyType) {
          columnNameAndType.set(attributeName, explicitPropertyType.getText())
        } else {
          columnNameAndType.set(attributeName, property.getType().getText())
        }
      }

      currentClass = currentClass.getBaseClass()
    }

    return columnNameAndType
  }

  private mapColumns(
    typescriptColumnTypes: Map<string, string>,
    columnTypeOverrides: Record<string, string> | undefined,
    model: LucidModel,
  ): Record<string, ZeroColumnProperties> {
    return Object.fromEntries(
      [...model.$columnsDefinitions].map(([attributeName, columnOptions]) => {
        const tsType = typescriptColumnTypes.get(attributeName)
        const override = columnTypeOverrides?.[attributeName]

        let zeroType: string
        if (override) {
          zeroType = override
        } else if (tsType) {
          zeroType = tsTypeToZeroType(tsType)
        } else {
          console.warn(
            `Could not infer Zero type for ${model.name}.${attributeName}. Falling back to json(). Add a columnTypeOverrides entry if this is wrong.`,
          )
          zeroType = 'json()'
        }

        const isOptional = !columnOptions.isPrimary && isTsTypeOptional(tsType)

        return [columnOptions.columnName, { type: zeroType, isOptional }]
      }),
    )
  }

  /** Translates a Lucid attribute name to its DB column name via $columnsDefinitions. */
  private resolveColumnName(lucidModel: LucidModel, attributeName: string): string {
    const entry = [...lucidModel.$columnsDefinitions].find(([attr]) => attr === attributeName)
    return entry ? entry[1].columnName : attributeName
  }

  private mapRelations(
    model: LucidModel,
    allModels: LucidModel[],
  ): Record<string, ZeroRelationshipProperties> {
    const relationships: Record<string, ZeroRelationshipProperties> = {}

    for (const [relationName, relation] of model.$relationsDefinitions) {
      try {
        // Lucid models are lazily loaded, so we need to boot them to get the relation definitions
        relation.boot()
      } catch (err) {
        throw new Error(
          `Failed to boot relation "${relationName}" on ${model.name}: ${String(err)}`,
        )
      }

      const relatedModel = relation.relatedModel()

      if (!allModels.some((m) => m.name === relatedModel.name)) {
        console.info(
          `Skipping relation "${relationName}" on ${model.name} — ${relatedModel.name} is not included.`,
        )
        continue
      }

      switch (relation.type) {
        case 'hasOne':
          relationships[relationName] = {
            type: 'one',
            sourceField: [this.resolveColumnName(model, relation.localKey)],
            destinationField: [this.resolveColumnName(relatedModel, relation.foreignKey)],
            destinationTable: relatedModel.table,
          }
          break

        case 'belongsTo':
          relationships[relationName] = {
            type: 'one',
            sourceField: [this.resolveColumnName(model, relation.foreignKey)],
            destinationField: [this.resolveColumnName(relatedModel, relation.localKey)],
            destinationTable: relatedModel.table,
          }
          break

        case 'hasMany':
          relationships[relationName] = {
            type: 'many',
            sourceField: [this.resolveColumnName(model, relation.localKey)],
            destinationField: [this.resolveColumnName(relatedModel, relation.foreignKey)],
            destinationTable: relatedModel.table,
          }
          break

        case 'manyToMany': {
          if (
            !relation.pivotTable ||
            !relation.pivotForeignKey ||
            !relation.pivotRelatedForeignKey
          ) {
            throw new Error(
              `manyToMany relation "${relationName}" on ${model.name} — pivot table fields could not be resolved after boot().`,
            )
          }

          relationships[relationName] = {
            type: 'many',
            chain: [
              {
                sourceField: [this.resolveColumnName(model, relation.localKey)],
                // pivotForeignKey and pivotRelatedForeignKey are already DB column names
                destinationField: [relation.pivotForeignKey],
                destinationTable: relation.pivotTable
              },
              {
                sourceField: [relation.pivotRelatedForeignKey],
                destinationField: [this.resolveColumnName(relatedModel, relation.relatedKey ?? relatedModel.primaryKey)],
                destinationTable: relatedModel.table,
              },
            ],
          }
          break
        }

        case 'hasManyThrough': {
          const throughRel = relation as typeof relation & {
            throughLocalKey?: string
            throughForeignKey?: string
            throughModel: () => LucidModel
          }

          if (!throughRel.throughModel) {
            throw new Error(
              `hasManyThrough relation "${relationName}" on ${model.name} — throughModel could not be resolved after boot().`,
            )
          }

          const throughModel = throughRel.throughModel()
          relationships[relationName] = {
            type: 'many',
            chain: [
              {
                sourceField: [this.resolveColumnName(model, relation.localKey)],
                destinationField: [this.resolveColumnName(throughModel, relation.foreignKey)],
                destinationTable: throughModel.table,
              },
              {
                sourceField: [this.resolveColumnName(throughModel, throughRel.throughLocalKey ?? throughModel.primaryKey)],
                destinationField: [this.resolveColumnName(relatedModel, throughRel.throughForeignKey ?? relatedModel.primaryKey)],
                destinationTable: relatedModel.table,
              },
            ],
          }
          break
        }
      }
    }

    return relationships
  }
}

export function isTsTypeOptional(type?: string): boolean {
  if (!type) {
    return false
  }

  return type.includes('null') || type.includes('undefined')
}

export function tsTypeToZeroType(type: string): string {
  const base = type
    .split('|')
    .map((t) => t.trim())
    .find((t) => t !== 'null' && t !== 'undefined')

  if (!base) return 'json()'

  return typesToZeroTypes[base] ?? 'json()'
}
