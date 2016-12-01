
// FIXME there must be a better way...
function getTypeValidate(typeValue) {
  if (typeValue.startsWith('varchar') || typeValue === 'text') {
    return value => typeof value === 'string';
  }
  if (typeValue.startsWith('numeric') || typeValue === 'smallint' || typeValue === 'integer' || typeValue === 'bigint') {
    return value => typeof value === 'number';
  }
  if (typeValue === 'boolean') {
    return value => typeof value === 'boolean';
  }
  // for unknown types, typevalidation will return true
  return () => true;
}


module.exports = {
  getTypeValidate
};
