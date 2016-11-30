/* global describe, it, context, before, beforeEach, after, afterEach */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');

const { InstanceError, ValidationError } = require('../src/error');

describe('InstanceError', () => {
  const err = new InstanceError('Model', {
    type: 'errtype'
  });

  it('has name InstanceError', () => {
    expect(err.name).to.equal('InstanceError');
  });

  it('has stack trace', () => {
    expect(err.stack).to.exist;
  });

  it('has default message', () => {
    expect(err.message).to.equal('A Model instance error has occured');
  });

  it('has extra info', () => {
    expect(err.type).to.equal('errtype');
  });

  it('overwrites error message from info', () => {
    const error = new InstanceError('Model', {
      message: 'errmsg'
    });

    expect(error.message).to.equal('errmsg');
  });

  it('does NOT overwrite name', () => {
    const error = new InstanceError('Model', {
      name: 'errname'
    });

    expect(error.name).to.equal('InstanceError');
  });
});

describe('ValidationError', () => {
  const err = new ValidationError('Model', {
    type: 'errtype'
  });

  it('has name ValidationError', () => {
    expect(err.name).to.equal('ValidationError');
  });

  it('has stack trace', () => {
    expect(err.stack).to.exist;
  });

  it('has default message', () => {
    expect(err.message).to.equal('A Model validation error has occured');
  });

  it('has extra info', () => {
    expect(err.type).to.equal('errtype');
  });

  it('overwrites error message from info', () => {
    const error = new ValidationError('Model', {
      message: 'errmsg'
    });

    expect(error.message).to.equal('errmsg');
  });

  it('does NOT overwrite name', () => {
    const error = new ValidationError('Model', {
      name: 'errname'
    });

    expect(error.name).to.equal('ValidationError');
  });
});
