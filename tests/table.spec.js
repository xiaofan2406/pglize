/* global describe, it, context, before, beforeEach, after, afterEach */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const types = require('../src/types');

const genTable = require('../src/table');

describe('table sql', () => {
  it('returns correct SQL query and values', () => {
    const tableName = 'test';
    const schema = {
      id: {
        type: 'serial',
        primary: true
      },
      email: {
        type: types.VARCHAR(),
        required: true,
        unique: true
      },
      username: {
        type: types.VARCHAR(),
        default: 'username'
      },
      createdAt: {
        type: types.TIMESTAMP
      },
      credit: {
        type: types.INTEGER,
        default: 100
      }
    };

    const result = genTable(tableName, schema);
    expect(result).to.exist;
    expect(result.query).to.equal('CREATE TABLE ${tableName~} ("id" serial PRIMARY KEY, "email" varchar(255) NOT NULL UNIQUE, "username" varchar(255) DEFAULT ${username}, "createdAt" timestamp with time zone, "credit" integer DEFAULT ${credit})');
    expect(result.values.username).to.equal('username');
    expect(result.values.credit).to.equal(100);
  });
});
