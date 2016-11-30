const _debug = require('debug');
const co = require('co');
const { InstanceError, ValidationError } = require('./error');


module.exports = db => (modelName, schema, modelOptions = {}) => {
  // TODO validation for schema, modelOptions
  const debug = _debug(`Model:${modelName}`);

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

      Object.defineProperty(this, '_stripData', {
        value() {
          this._data = {};
        }
      });

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

      // define instance methods
      if (modelOptions.methods) {
        for (const name in modelOptions.methods) {
          if ({}.hasOwnProperty.call(modelOptions.methods, name)) {
            debug('Adding instance methods...', name);
            Object.defineProperty(this, name, {
              value: modelOptions.methods[name].bind(this)
            });
          }
        }
      }

      // helper function for validation
      Object.defineProperty(this, '_validate', {
        value(_data, full = true) {
          return new Promise((resolve, reject) => {
            const errors = [];

            for (const name in schema) {
              if ({}.hasOwnProperty.call(schema, name)) {
                if (typeof _data[name] !== 'undefined') {
                  // basic type validation
                  if (_data[name].constructor !== schema[name].type) {
                    errors.push({ name, type: 'type' });
                  }

                  // custom schema validation
                  if (schema[name].validate) {
                    const validate = schema[name].validate.bind(this);
                    if (!validate(_data[name])) {
                      errors.push({ name, type: 'custom' });
                    }
                  }
                } else if (full === true) {
                  // required validation
                  if (schema[name].required === true) { // eslint-disable-line no-lonely-if
                    errors.push({ name, type: 'required' });
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
              })); // TODO some error
            } else {
              resolve(true);
            }
          });
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
    }
  };

  Object.defineProperty(obj[modelName], 'findOne', {
    value(name, value) {
      return new Promise((resolve, reject) => {
        const query = `SELECT * from ${tableName} WHERE "${name}"=$1`;
        debug('findOne', query);
        db.any(query, value)
        .then((result) => {
          let data;
          if (result.length === 1) {
            data = result;
          } else if (result.length > 1) {
            data = result[0];
          } else {
            reject();
          }
          const instance = new obj[modelName](data);
          instance._dataUpdate(data);
          resolve(instance);
        });
      });
    }
  });

  return obj[modelName];
};
