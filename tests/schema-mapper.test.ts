import { describe, expect, it, vi } from 'vitest'
import {
  mapColumns,
  mapRelations,
  toZeroRelationshipsName,
  toZeroTableName,
} from '../src/schema-mapper.js'
import { createMockModel } from './helpers.js'

// ----------------------------------------------------------------
// Naming helpers
// ----------------------------------------------------------------

describe('toZeroTableName', () => {
  it('lowercases first letter and appends Table', () => {
    expect(toZeroTableName('User')).toBe('userTable')
    expect(toZeroTableName('WorkspaceMembership')).toBe('workspaceMembershipTable')
    expect(toZeroTableName('Room')).toBe('roomTable')
  })
})

describe('toZeroRelationshipsName', () => {
  it('appends Relationships to the table const name', () => {
    expect(toZeroRelationshipsName('User')).toBe('userTableRelationships')
    expect(toZeroRelationshipsName('Room')).toBe('roomTableRelationships')
  })
})

// ----------------------------------------------------------------
// mapColumns
// ----------------------------------------------------------------

describe('mapColumns', () => {
  it('maps a basic string column with no remapping', () => {
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: {
        id: { columnName: 'id', isPrimary: true },
        name: { columnName: 'name' },
      },
    })

    const result = mapColumns(model, undefined, new Map([
      ['id', 'string'],
      ['name', 'string'],
    ]))

    expect(result.id).toEqual({ type: 'string()', isOptional: false, mappedName: null })
    expect(result.name).toEqual({ type: 'string()', isOptional: false, mappedName: null })
  })

  it('sets mappedName when DB column name differs from attribute name', () => {
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: {
        createdAt: { columnName: 'created_at' },
      },
    })

    const result = mapColumns(model, undefined, new Map([['createdAt', 'DateTime | null']]))

    expect(result.createdAt?.mappedName).toBe('created_at')
  })

  it('marks nullable types as optional', () => {
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: {
        bio: { columnName: 'bio' },
      },
    })

    const result = mapColumns(model, undefined, new Map([['bio', 'string | null']]))

    expect(result.bio?.isOptional).toBe(true)
  })

  it('primary key is never optional even if type is nullable', () => {
    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: {
        id: { columnName: 'id', isPrimary: true },
      },
    })

    const result = mapColumns(model, undefined, new Map([['id', 'string | null']]))

    expect(result.id?.isOptional).toBe(false)
  })

  it('applies columnTypes override for Zero type', () => {
    const model = createMockModel({
      name: 'Issue',
      table: 'issues',
      columns: {
        metadata: { columnName: 'metadata' },
      },
    })

    const result = mapColumns(
      model,
      { metadata: 'json<{ priority: number }>()'  },
      new Map([['metadata', 'any']]),
    )

    expect(result.metadata?.type).toBe('json<{ priority: number }>()')
  })

  it('infers optionality from source type even when columnTypes override is set', () => {
    const model = createMockModel({
      name: 'UserIdentity',
      table: 'user_identities',
      columns: {
        meta: { columnName: 'meta' },
      },
    })

    const result = mapColumns(
      model,
      { meta: 'json()' },
      new Map([['meta', 'any | null']]),
    )

    expect(result.meta?.type).toBe('json()')
    expect(result.meta?.isOptional).toBe(true)
  })

  it('falls back to json() and warns when no type info available', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const model = createMockModel({
      name: 'User',
      table: 'users',
      columns: { mystery: { columnName: 'mystery' } },
    })

    const result = mapColumns(model, undefined, new Map())

    expect(result.mystery?.type).toBe('json()')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('User.mystery'))

    warn.mockRestore()
  })
})

// ----------------------------------------------------------------
// mapRelations
// ----------------------------------------------------------------

describe('mapRelations', () => {
  const userModel = createMockModel({ name: 'User', table: 'users', columns: { id: { columnName: 'id', isPrimary: true } } })
  const postModel = createMockModel({ name: 'Post', table: 'posts', columns: { id: { columnName: 'id', isPrimary: true } } })
  const profileModel = createMockModel({ name: 'Profile', table: 'profiles', columns: { id: { columnName: 'id', isPrimary: true } } })

  it('maps hasOne correctly', () => {
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

    const result = mapRelations(model, [model, profileModel])

    expect(result.profile).toEqual({
      type: 'one',
      sourceField: ['id'],
      destField: ['userId'],
      destSchema: 'profileTable',
    })
  })

  it('maps hasMany correctly', () => {
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

    const result = mapRelations(model, [model, postModel])

    expect(result.posts).toEqual({
      type: 'many',
      sourceField: ['id'],
      destField: ['authorId'],
      destSchema: 'postTable',
    })
  })

  it('maps belongsTo with swapped source/dest fields', () => {
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

    const result = mapRelations(model, [model, userModel])

    expect(result.author).toEqual({
      type: 'one',
      sourceField: ['authorId'],
      destField: ['id'],
      destSchema: 'userTable',
    })
  })

  it('maps manyToMany as a two-link chain', () => {
    const tagModel = createMockModel({ name: 'Tag', table: 'tags', columns: { id: { columnName: 'id', isPrimary: true } } })
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

    const result = mapRelations(model, [model, tagModel])

    expect(result.tags).toEqual({
      type: 'many',
      chain: [
        { sourceField: ['id'], destField: ['post_id'], destSchema: 'post_tagsTable' },
        { sourceField: ['tag_id'], destField: ['id'], destSchema: 'tagTable' },
      ],
    })
  })

  it('maps hasManyThrough as a two-link chain', () => {
    const memberModel = createMockModel({ name: 'Member', table: 'members', columns: { id: { columnName: 'id', isPrimary: true } } })
    const issueModel = createMockModel({ name: 'Issue', table: 'issues', columns: { id: { columnName: 'id', isPrimary: true } } })
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

    const result = mapRelations(orgModel, [orgModel, memberModel, issueModel])

    expect(result.issues).toEqual({
      type: 'many',
      chain: [
        { sourceField: ['id'], destField: ['organization_id'], destSchema: 'memberTable' },
        { sourceField: ['id'], destField: ['member_id'], destSchema: 'issueTable' },
      ],
    })
  })

  it('skips relation and logs info when related model is not in allModels', () => {
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

    const result = mapRelations(model, [model]) // postModel excluded

    expect(result.posts).toBeUndefined()
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Post was not found'))

    info.mockRestore()
  })

  it('skips relation and warns when boot() throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

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

    const result = mapRelations(model, [model, postModel])

    expect(result.posts).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boot() failed'))

    warn.mockRestore()
  })
})
