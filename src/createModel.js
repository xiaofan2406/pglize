const _debug = require('debug');
const co = require('co');
const { InstanceError, ValidationError, ModelError } = require('./error');
const { getTypeValidate } = require('./validate');
const genTable = require('./table');
const pkg = require('../package.json');


module.exports = db => (modelName, schema, modelOptions = {}) => {
  // TODO validation for schema, modelOptions
  const debug = _debug(`${pkg.name}:${modelName}`);

  const sanitizeData = (data) => {
    const validKeys = Object.keys(schema);
    return Object.keys(data)
      .filter(key => validKeys.includes(key)) // => only validKeys from data
      .reduce((reduced, key) => Object.assign(reduced, {
        [key]: data[key]
      }), {});
  };

  const isFunc = func => func && typeof func === 'function';

  const tableName = modelOptions.tableName || modelName.toLowerCase();


  // generates default id column as primary key
  if (!schema.id) {
    schema.id = {
      type: 'serial',
      primary: true
    };
  }


  const obj = {
    [modelName]: function(data = {}) { // eslint-disable-line
      // pre process data
      const saneData = sanitizeData(data);
      const withDefault = Object.keys(schema)
        .filter(field => typeof schema[field].default !== 'undefined') // fields has default values
        .filter(field => typeof saneData[field] === 'undefined') // default fields that have no values
        .reduce((reduced, key) => Object.assign(reduced, { [key]: schema[key].default }),
          saneData);

      for (const name in withDefault) {
        if ({}.hasOwnProperty.call(withDefault, name)) {
          this[name] = withDefault[name];
        }
      }

      Object.defineProperty(this, '_data', {
        writable: true,
        value: {}
      });

      // helper to empty data after instance.delete
      Object.defineProperty(this, '_stripData', {
        value() {
          this._data = {};
        }
      });

      // helper to keep this._data and this updated with latest database result
      Object.defineProperty(this, '_dataUpdate', {
        value(newData) {
          for (const name in newData) {
            if ({}.hasOwnProperty.call(newData, name)) {
              this[name] = newData[name];
              this._data[name] = newData[name];
            }
          }
        }
      });

      // helper for data validation before save and update
      Object.defineProperty(this, '_validate', {
        value(raw, full = true) {
          return new Promise((resolve, reject) => {
            const errors = [];

            for (const name in schema) {
              if ({}.hasOwnProperty.call(schema, name)) {
                if (typeof raw[name] !== 'undefined' && raw[name] !== null) {
                  // basic type validation
                  if (!getTypeValidate(schema[name].type)(raw[name])) {
                    errors.push({ name, type: 'type' });
                    continue;
                  }

                  // custom schema validation
                  if (schema[name].validate) {
                    const validate = schema[name].validate.bind(this);
                    if (!validate(raw[name])) {
                      errors.push({ name, type: 'custom' });
                      continue;
                    }
                  }
                } else if (full === true) {
                  if (schema[name].required === true) {
                    errors.push({ name, type: 'required' });
                    continue;
                  }
                }
              }
            }
            if (errors.length > 0) {
              reject(new ValidationError(modelName, {
                attr: errors.map(error => error.name),
                message: `${modelName} schema validation error`,
                typeValidation: errors.filter(error => error.type === 'type').map(error => error.name),
                customValidation: errors.filter(error => error.type === 'custom').map(error => error.name),
                requiredValidation: errors.filter(error => error.type === 'required').map(error => error.name)
              }));
            } else {
              resolve(true);
            }
          });
        }
      });

      Object.defineProperty(this, 'isSaved', {
        get() {
          return Boolean(this._data.id);
        }
      });

      Object.defineProperty(this, 'selfie', {
        get() {
          return this._data;
        }
      });

      Object.defineProperty(this, 'save', {
        value() {
          const self = this;

          return co(function* () {
            if (isFunc(modelOptions.preSave)) {
              debug('preSave hook detected, excuting...');
              const preSave = modelOptions.preSave.bind(self);
              yield preSave();
              debug('preSave hook finished.');
            }

            yield self._validate(self);

            if (modelOptions.timestamps) {
              self.createdAt = new Date();
              self.updatedAt = new Date();
            }

            const names = Object.keys(self);
            const valuesStr = names.map(key => `$\{${key}}`).join(', ');
            const query = `INSERT INTO ${tableName} (${names.map(name => `"${name}"`).join(', ')}) VALUES (${valuesStr}) RETURNING *`;
            debug('Save:', query);
            const result = yield db.one(query, self);
            self._dataUpdate(result);

            if (isFunc(modelOptions.postSave)) {
              debug('postSave hook detected, excuting...');
              const postSave = modelOptions.postSave.bind(self);
              yield postSave();
              debug('postSave hook finished.');
            }

            return self;
          });
        }
      });

      Object.defineProperty(this, 'update', {
        value(updates) {
          const self = this;

          if (this.isSaved) {
            return co(function* () {
              if (isFunc(modelOptions.preUpdate)) {
                debug('preUpdate hook detected, excuting...');
                const preUpdate = modelOptions.preUpdate.bind(self);
                yield preUpdate(updates);
                debug('preUpdate hook finished.');
              }

              const saneUpdates = sanitizeData(updates);

              yield self._validate(saneUpdates, false);

              const names = Object.keys(saneUpdates);
              const values = names.map(name => saneUpdates[name]);
              const setValues = names.map((name, index) => `"${name}"=$${index + 1}`).join(', ');
              const query = `UPDATE ${tableName} SET ${setValues} WHERE id=$${names.length + 1} RETURNING *`;
              debug('Update:', query);
              const result = yield db.one(query, [...values, self._data.id]);
              self._dataUpdate(result);

              if (isFunc(modelOptions.postUpdate)) {
                debug('postUpdate hook detected, excuting...');
                const postUpdate = modelOptions.postUpdate.bind(self);
                yield postUpdate();
                debug('postUpdate hook finished.');
              }

              return self;
            });
          }

          return Promise.reject(new InstanceError(modelName, {
            message: 'This instance has not been saved yet'
          }));
        }
      });

      Object.defineProperty(this, 'delete', {
        value(options = {}) {
          const self = this;

          if (self.isSaved) {
            return co(function* () {
              const {
                softDelete = modelOptions.softDelete
              } = options;

              if (isFunc(modelOptions.preDelete)) {
                debug('preDelete hook detected, excuting...');
                const preDelete = modelOptions.preDelete.bind(self);
                yield preDelete();
                debug('preDelete hook finished.');
              }

              let result;
              if (softDelete === true) {
                const query = `UPDATE ${tableName} SET "deletedAt"=$1 WHERE id=$2 RETURNING *`;
                debug('Delete:', query);
                result = yield db.one(query, [new Date(), self._data.id]);
              } else {
                const query = `DELETE FROM ${tableName} WHERE id=$1 RETURNING *`;
                debug('Delete:', query);
                result = yield db.one(query, [self._data.id]);
              }
              self._dataUpdate(result);
              self._stripData();

              if (isFunc(modelOptions.postDelete)) {
                debug('postDelete hook detected, excuting...');
                const postDelete = modelOptions.postDelete.bind(self);
                yield postDelete();
                debug('postDelete hook finished.');
              }

              return self;
            });
          }

          return Promise.reject(new InstanceError(modelName, {
            message: 'This instance has not been saved yet'
          }));
        }
      });

      // define instance methods
      if (modelOptions.instanceMethods) {
        const preserved = Object.getOwnPropertyNames(this);
        for (const name in modelOptions.instanceMethods) {
          if ({}.hasOwnProperty.call(modelOptions.instanceMethods, name)) {
            debug('Adding instance methods...', name);
            if (preserved.includes(name)) {
              debug('\tSkipping preserve instance property', name);
            } else {
              Object.defineProperty(this, name, {
                value: modelOptions.instanceMethods[name].bind(this)
              });
            }
          }
        }
      }
    }
  };

  Object.defineProperty(obj[modelName], 'syncTable', {
    value(force = false) {
      if (force === true) {
        return co(function* () {
          yield db.none('DROP TABLE IF EXISTS $1~', [tableName]);

          const result = genTable(tableName, schema);
          debug('syncTable: creating table...', tableName);
          debug('\t', result.query);
          yield db.none(result.query, result.values);
        });
      }
      return Promise.resolve();
    }
  });

  Object.defineProperty(obj[modelName], 'findOne', {
    value(name, value) {
      return new Promise((resolve, reject) => {
        if (typeof name !== 'string' || typeof value === 'undefined') {
          reject(new ModelError(modelName, {
            message: `Usage: ${modelName}.findOne(name, value)`
          }));
        }

        const query = `SELECT * from ${tableName} WHERE "${name}"=$1`;
        debug('findOne', query);
        db.any(query, value)
        .then((result) => {
          let data;
          if (result.length > 0) {
            data = result[0];
          } else {
            resolve(null);
          }
          const instance = new obj[modelName](data);
          instance._dataUpdate(data);
          resolve(instance);
        })
        .catch((err) => {
          reject(new ModelError(modelName, {
            message: err.message,
            path: `${modelName}.findOne`
          }));
        });
      });
    }
  });

  // define model methods
  if (modelOptions.modelMethods) {
    const preserved = Object.getOwnPropertyNames(obj[modelName]);
    for (const name in modelOptions.modelMethods) {
      if ({}.hasOwnProperty.call(modelOptions.modelMethods, name)) {
        debug('Adding model methods...', name);
        if (preserved.includes(name)) {
          debug('\tSkipping preserve model property', name);
        } else {
          Object.defineProperty(obj[modelName], name, {
            value: modelOptions.modelMethods[name].bind(obj[modelName])
          });
        }
      }
    }
  }

  return obj[modelName];
};
