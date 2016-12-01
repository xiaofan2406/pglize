function genColumn(name, attr) {
  const constraint = [`"${name}"`, attr.type];

  if (attr.default) {
    constraint.push(`DEFAULT $\{${name}}`);
  }

  if (attr.required) {
    constraint.push('NOT NULL');
  }

  if (attr.unique) {
    constraint.push('UNIQUE');
  }

  if (attr.primary) {
    constraint.push('PRIMARY KEY');
  }

  return constraint.join(' ');
}


function genTable(name, attrs) {
  let query = 'CREATE TABLE ${tableName~} (';

  const columns = [];
  const values = {
    tableName: name
  };
  for (const attrName in attrs) {
    if ({}.hasOwnProperty.call(attrs, attrName)) {
      columns.push(genColumn(attrName, attrs[attrName]));

      if (attrs[attrName].default) {
        values[attrName] = attrs[attrName].default;
      }
    }
  }
  query += columns.join(', ');

  query += ')';
  return {
    query,
    values
  };
}


module.exports = genTable;
