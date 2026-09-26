import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import SchemaTransformer from '../src/schema-transformer.js'
import { Config } from '../src/config.js'
import { createMockModel } from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tsconfigPath = path.resolve(__dirname, '../tsconfig.json')

function makeTransformer() {
  const config = new Config({ modelsDirectory: '.' })
  return new SchemaTransformer(config, tsconfigPath)
}

// ----------------------------------------------------------------
// mapColumns (private — accessed via (transformer as any))
// ----------------------------------------------------------------

describe('mapColumns', () => {
  it('maps a basic string column with no remapping', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: {
        id: { columnName: 'id', isPrimary: true },
        name: { columnName: 'name' },
      },
    })

    const result = (transformer as any).mapColumns(
      new Map([
        ['id', 'string'],
        ['name', 'string'],
      ]),
      undefined,
      model,
    )

    expect(result.id).toEqual({ type: 'string()', isOptional: false })
    expect(result.name).toEqual({ type: 'string()', isOptional: false })
  })

  it('is keyed by DB column name when attribute name differs', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: {
        createdAt: { columnName: 'created_at' },
      },
    })

    const result = (transformer as any).mapColumns(
      new Map([['createdAt', 'DateTime | null']]),
      undefined,
      model,
    )

    expect(result['created_at']).toEqual({ type: 'number()', isOptional: true })
    expect(result['createdAt']).toBeUndefined()
  })

  it('marks nullable types as optional', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: {
        bio: { columnName: 'bio' },
      },
    })

    const result = (transformer as any).mapColumns(
      new Map([['bio', 'string | null']]),
      undefined,
      model,
    )

    expect(result.bio?.isOptional).toBe(true)
  })

  it('primary key is never optional even if type is nullable', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: {
        id: { columnName: 'id', isPrimary: true },
      },
    })

    const result = (transformer as any).mapColumns(
      new Map([['id', 'string | null']]),
      undefined,
      model,
    )

    expect(result.id?.isOptional).toBe(false)
  })

  it('applies columnTypeOverrides override for Zero type', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'Issue',
      table: 'issues',
      columns: {
        metadata: { columnName: 'metadata' },
      },
    })

    const result = (transformer as any).mapColumns(
      new Map([['metadata', 'any']]),
      { metadata: 'json<{ priority: number }>()' },
      model,
    )

    expect(result.metadata?.type).toBe('json<{ priority: number }>()')
  })

  it('infers optionality from source type even when columnTypeOverrides override is set', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'UserIdentity',
      table: 'user_identities',
      columns: {
        meta: { columnName: 'meta' },
      },
    })

    const result = (transformer as any).mapColumns(
      new Map([['meta', 'any | null']]),
      { meta: 'json()' },
      model,
    )

    expect(result.meta?.type).toBe('json()')
    expect(result.meta?.isOptional).toBe(true)
  })

  it('falls back to json() and warns when no type info available', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: { mystery: { columnName: 'mystery' } },
    })

    const result = (transformer as any).mapColumns(new Map(), undefined, model)

    expect(result.mystery?.type).toBe('json()')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('User.mystery'))

    warn.mockRestore()
  })
})

// ----------------------------------------------------------------
// mapRelations (private — accessed via (transformer as any))
// ----------------------------------------------------------------

describe('mapRelations', () => {
  const userModel = createMockModel({
    name: 'User',
    table: 'users',
    columns: { id: { columnName: 'id', isPrimary: true } },
  })
  const postModel = createMockModel({
    name: 'Post',
    table: 'posts',
    columns: { id: { columnName: 'id', isPrimary: true } },
  })
  const profileModel = createMockModel({
    name: 'Profile',
    table: 'profiles',
    columns: { id: { columnName: 'id', isPrimary: true } },
  })

  it('maps hasOne correctly', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: { id: { columnName: 'id', isPrimary: true } },
      relations: {
        profile: {
          type: 'hasOne',
          localKey: 'id',
          foreignKey: 'userId',
          relatedModel: () => profileModel,
        },
      },
    })

    const result = (transformer as any).mapRelations(model, [model, profileModel])

    expect(result.profile).toEqual({
      type: 'one',
      sourceField: ['id'],
      destinationField: ['userId'],
      destinationTable: 'profiles',
    })
  })

  it('maps hasMany correctly', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: { id: { columnName: 'id', isPrimary: true } },
      relations: {
        posts: {
          type: 'hasMany',
          localKey: 'id',
          foreignKey: 'authorId',
          relatedModel: () => postModel,
        },
      },
    })

    const result = (transformer as any).mapRelations(model, [model, postModel])

    expect(result.posts).toEqual({
      type: 'many',
      sourceField: ['id'],
      destinationField: ['authorId'],
      destinationTable: 'posts',
    })
  })

  it('maps belongsTo with swapped source/dest fields', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'Post',
      table: 'posts',
      columns: { id: { columnName: 'id', isPrimary: true } },
      relations: {
        author: {
          type: 'belongsTo',
          localKey: 'id',
          foreignKey: 'authorId',
          relatedModel: () => userModel,
        },
      },
    })

    const result = (transformer as any).mapRelations(model, [model, userModel])

    expect(result.author).toEqual({
      type: 'one',
      sourceField: ['authorId'],
      destinationField: ['id'],
      destinationTable: 'users',
    })
  })

  it('maps manyToMany as a two-link chain', () => {
    const transformer = makeTransformer()
    const tagModel = createMockModel({
      name: 'Tag',
      table: 'tags',
      columns: { id: { columnName: 'id', isPrimary: true } },
    })
    const model = createMockModel({
      name: 'Post',
      table: 'posts',
      columns: { id: { columnName: 'id', isPrimary: true } },
      relations: {
        tags: {
          type: 'manyToMany',
          localKey: 'id',
          foreignKey: 'postId',
          pivotTable: 'post_tags',
          pivotForeignKey: 'post_id',
          pivotRelatedForeignKey: 'tag_id',
          relatedKey: 'id',
          relatedModel: () => tagModel,
        },
      },
    })

    const result = (transformer as any).mapRelations(model, [model, tagModel])

    expect(result.tags).toEqual({
      type: 'many',
      chain: [
        { sourceField: ['id'], destinationField: ['post_id'], destinationTable: 'post_tags' },
        { sourceField: ['tag_id'], destinationField: ['id'], destinationTable: 'tags' },
      ],
    })
  })

  it('maps hasManyThrough as a two-link chain', () => {
    const transformer = makeTransformer()
    const memberModel = createMockModel({
      name: 'Member',
      table: 'members',
      columns: { id: { columnName: 'id', isPrimary: true } },
    })
    const issueModel = createMockModel({
      name: 'Issue',
      table: 'issues',
      columns: { id: { columnName: 'id', isPrimary: true } },
    })
    const orgModel = createMockModel({
      name: 'Organization',
      table: 'organizations',
      columns: { id: { columnName: 'id', isPrimary: true } },
      relations: {
        issues: {
          type: 'hasManyThrough',
          localKey: 'id',
          foreignKey: 'organization_id',
          throughModel: () => memberModel,
          throughLocalKey: 'id',
          throughForeignKey: 'member_id',
          relatedModel: () => issueModel,
        },
      },
    })

    const result = (transformer as any).mapRelations(orgModel, [orgModel, memberModel, issueModel])

    expect(result.issues).toEqual({
      type: 'many',
      chain: [
        { sourceField: ['id'], destinationField: ['organization_id'], destinationTable: 'members' },
        { sourceField: ['id'], destinationField: ['member_id'], destinationTable: 'issues' },
      ],
    })
  })

  it('skips relation and logs info when related model is not in allModels', () => {
    const transformer = makeTransformer()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: { id: { columnName: 'id', isPrimary: true } },
      relations: {
        posts: {
          type: 'hasMany',
          localKey: 'id',
          foreignKey: 'userId',
          relatedModel: () => postModel,
        },
      },
    })

    const result = (transformer as any).mapRelations(model, [model]) // postModel excluded

    expect(result.posts).toBeUndefined()
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Post is not included'))

    info.mockRestore()
  })

  it('throws when boot() throws', () => {
    const transformer = makeTransformer()
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: { id: { columnName: 'id', isPrimary: true } },
      relations: {
        posts: {
          type: 'hasMany',
          localKey: 'id',
          foreignKey: 'userId',
          relatedModel: () => postModel,
          bootError: 'Cannot resolve related model',
        },
      },
    })

    expect(() => (transformer as any).mapRelations(model, [model, postModel])).toThrow(
      'Failed to boot relation',
    )
  })
})
