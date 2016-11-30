// TODO types
function mapTypes(type) {
  switch (type.constructor) {
    case Number:
      return 'integer';
    case String:
      return 'character varying(255)';
    case Date:
      return 'timestamps with time zone';
    case Boolean:
      return 'boolean';
    default:
      return 'json';
  }
}


function genColumn(name, attr) {
  let column = name;
  column += mapTypes(attr.type);

  if (attr.default) {
    column += `DEFAULT ${attr.default}`;
  }

  if (attr.required) {
    column += 'NOT NULL';
  }

  if (attr.unique) {
    column += 'UNIQUE';
  }

  return column;
}


function genTable(name, attrs) {
  let query = `CREATE TABLE ${name} (`;

  const columns = [];
  columns.push('id serial PRIMARY KEY');
  for (const attrName in attrs) {
    if ({}.hasOwnProperty.call(attrs, attrName)) {
      columns.push(genColumn(attrName, attrs[attrName]));
    }
  }
  query += columns.join(',');

  query += ')';
  return query;
}


module.exports = genTable;
