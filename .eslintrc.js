module.exports = {
  root: true,
  env: {
    commonjs: true,
    es6: true,
    node: true
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 6,
    ecmaFeatures: {
      generators: true
    }
  },
  extends: ['airbnb-base'],
  rules: { // these are the rules to work with airbnb style guide together
    'comma-dangle': [2, 'never'], // disallow comma after the last propery of an object
    'no-param-reassign': 0, // allow modify params
    'func-names': 0, // anonymous functions still common
    'no-underscore-dangle': 0, // disable for private methods
    'no-restricted-syntax': ['error', 'WithStatement'],
    'import/no-extraneous-dependencies': 0
  }
};
