import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { ResolvedConfig } from './config.js'
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
  private config: ResolvedConfig
  private project: Project

  constructor(config: ResolvedConfig, tsconfigPath?: string) {
    this.config = config
    this.project = new Project({ tsConfigFilePath: tsconfigPath ?? 'tsconfig.json' })
  }

  public transform(): TransformedSchema {
    return {
      models: this.config.models.map((model) => {
        const columnNameAndTypePairs = this.extractColumnNameAndType(model)
        const columnOverrides = this.config.columnTypes?.[model.name]

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
        `lucid-zero: Could not find source file for model ${model.name} in ${this.project
          .getSourceFiles()
          .map((sourceFile) => sourceFile.getFilePath())
          .join(', ')}`,
      )
    }

    const classDeclaration = modelSourceFile.getClass(model.name)

    if (!classDeclaration) {
      throw new Error(`lucid-zero: Could not find class declaration for model ${model.name}`)
    }

    let currentClass: ClassDeclaration | undefined = classDeclaration

    // Walk up the inheritance chain — derived class properties win
    while (currentClass) {
      for (const property of currentClass.getProperties()) {
        const attributeName = property.getName()

        if (!model.$hasColumn(attributeName)) continue
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
            `lucid-zero: Could not infer Zero type for ${model.name}.${attributeName}. Falling back to json(). Add a columnTypes override if this is wrong.`,
          )
          zeroType = 'json()'
        }

        const isOptional = !columnOptions.isPrimary && isTsTypeOptional(tsType)

        return [columnOptions.columnName, { type: zeroType, isOptional }]
      }),
    )
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
          `lucid-zero: Failed to boot relation "${relationName}" on ${model.name}: ${String(err)}`,
        )
      }

      const relatedModel = relation.relatedModel()

      if (!allModels.some((m) => m.name === relatedModel.name)) {
        console.info(
          `lucid-zero: Skipping relation "${relationName}" on ${model.name} — ${relatedModel.name} was not found in modelsSourcePath.`,
        )
        continue
      }

      switch (relation.type) {
        case 'hasOne':
          relationships[relationName] = {
            type: 'one',
            sourceField: [relation.localKey],
            destinationField: [relation.foreignKey],
            destinationTable: relatedModel.table,
          }
          break

        case 'belongsTo':
          relationships[relationName] = {
            type: 'one',
            sourceField: [relation.foreignKey],
            destinationField: [relation.localKey],
            destinationTable: relatedModel.table,
          }
          break

        case 'hasMany':
          relationships[relationName] = {
            type: 'many',
            sourceField: [relation.localKey],
            destinationField: [relation.foreignKey],
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
              `lucid-zero: manyToMany relation "${relationName}" on ${model.name} — pivot table fields could not be resolved after boot().`,
            )
          }

          relationships[relationName] = {
            type: 'many',
            chain: [
              {
                sourceField: [relation.localKey],
                destinationField: [relation.pivotForeignKey],
                destinationTable: relation.pivotTable
              },
              {
                sourceField: [relation.pivotRelatedForeignKey],
                destinationField: [relation.relatedKey ?? relatedModel.primaryKey],
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
              `lucid-zero: hasManyThrough relation "${relationName}" on ${model.name} — throughModel could not be resolved after boot().`,
            )
          }

          const throughModel = throughRel.throughModel()
          relationships[relationName] = {
            type: 'many',
            chain: [
              {
                sourceField: [relation.localKey],
                destinationField: [relation.foreignKey],
                destinationTable: throughModel.table,
              },
              {
                sourceField: [throughRel.throughLocalKey ?? throughModel.primaryKey],
                destinationField: [throughRel.throughForeignKey ?? relatedModel.primaryKey],
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
    return true
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
