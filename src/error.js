function InstanceError(modelName, info = {}) {
  Error.call(this);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }

  Object.assign(this, info);

  this.message = info.message || `A ${modelName} instance error has occured`;
  this.name = 'InstanceError';
}
InstanceError.prototype = Object.create(Error.prototype);
InstanceError.prototype.constructor = Error;


function ValidationError(modelName, info = {}) {
  InstanceError.call(this, modelName, info);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }

  this.message = info.message || `A ${modelName} validation error has occured`;
  this.name = 'ValidationError';
}
ValidationError.prototype = Object.create(InstanceError.prototype);
ValidationError.prototype.constructor = InstanceError;


function ModelError(modelName, info = {}) {
  Error.call(this);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }

  this.message = info.message || `A ${modelName} model error has occured`;
  Object.assign(this, info);
  this.name = 'ModelError';
}
ModelError.prototype = Object.create(Error.prototype);
ModelError.prototype.constructor = Error;


module.exports = {
  InstanceError,
  ValidationError,
  ModelError
};
