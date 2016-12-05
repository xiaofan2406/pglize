/* global describe, it, context, before, beforeEach, after, afterEach */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const co = require('co');

const config = require('./config')[process.env.NODE_ENV || 'test'];
const { createModel, db, types } = require('../src/')(config);

const testTableName = 'users';


before('check testing table', (done) => {
  co(function* () {
    const result = yield db.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2)', ['public', testTableName]);
    if (!result.exists) {
      yield db.none(`
        CREATE TABLE ${testTableName} (id SERIAL,
        email character varying(255) NOT NULL,
        password character varying(255) NOT NULL,
        activated boolean NOT NULL DEFAULT false,
        credit integer NOT NULL DEFAULT 0,
        "createdAt" timestamp with time zone,
        "updatedAt" timestamp with time zone,
        "deletedAt" timestamp with time zone,
        CONSTRAINT users_pkey PRIMARY KEY (id),
        CONSTRAINT users_email_key UNIQUE (email))`
      );
    }
  })
  .then(done)
  .catch(done);
});


describe('object construction', () => {
  const UserModel = createModel('User', {
    email: {
      type: types.VARCHAR()
    },
    credit: {
      type: types.INTEGER,
      default: 100
    }
  });

  it('ignores invalid fields in the initial data', () => {
    const user = new UserModel({
      email: 'bonjovi@mail.com',
      credit: 9000,
      unknown: 'someunknow stuff'
    });

    expect(user.email).to.equal('bonjovi@mail.com');
    expect(user.credit).to.equal(9000);
    expect(user.unknown).to.be.undefined;
  });

  it('gives default values when undefined', () => {
    const user = new UserModel({
      email: 'bonjovi@mail.com'
    });

    expect(user.email).to.equal('bonjovi@mail.com');
    expect(user.credit).to.equal(100);
  });

  it('should not have any _data', () => {
    const user = new UserModel({
      email: 'bonjovi@mail.com'
    });

    expect(user._data).to.be.empty;
  });
});


describe('save to database', () => {
  context('validations', () => {
    const UserModel = createModel('User', {
      email: {
        type: types.VARCHAR(),
        required: true
      },
      AGE: {
        type: types.NUMERIC()
      },
      credit: {
        type: types.INTEGER,
        default: 100,
        validate(value) {
          return value >= 100;
        }
      },
      activated: {
        type: types.BOOLEAN
      },
      random: {
        type: 'unkonwtype'
      }
    });

    it('runs basic type validation', (done) => {
      const user = new UserModel({
        email: 123456,
        credit: 'what',
        activated: 'true',
        random: 'random'
      });

      user.save()
      .catch((err) => {
        expect(err.name).to.equal('ValidationError');
        expect(err.message).to.equal('User schema validation error');
        expect(err.attr).to.not.include.members(['random']);
        expect(err.attr).to.include.members(['email', 'credit', 'activated']);
        expect(err.typeValidation).to.include.members(['email', 'credit', 'activated']);
        done();
      });
    });

    it('runs required validation', (done) => {
      const user = new UserModel({
        email: null,
        credit: 200
      });

      user.save()
      .catch((err) => {
        expect(err.name).to.equal('ValidationError');
        expect(err.message).to.equal('User schema validation error');
        expect(err.attr).to.include.members(['email']);
        expect(err.requiredValidation).to.include.members(['email']);
        done();
      });
    });

    it('runs custom schema validation functions', (done) => {
      const user = new UserModel({
        email: 'bonjovi@mail.com',
        credit: 99
      });

      user.save()
      .catch((err) => {
        expect(err.name).to.equal('ValidationError');
        expect(err.message).to.equal('User schema validation error');
        expect(err.attr).to.include.members(['credit']);
        expect(err.customValidation).to.include.members(['credit']);
        done();
      });
    });

    it('keeps tracks of all failed validations', (done) => {
      const user = new UserModel({
        AGE: 'AGE',
        credit: 10
      });

      user.save()
      .catch((err) => {
        expect(err.name).to.equal('ValidationError');
        expect(err.message).to.equal('User schema validation error');
        expect(err.attr).to.include.members(['email', 'credit', 'AGE']);
        expect(err.typeValidation).to.include.members(['AGE']);
        expect(err.requiredValidation).to.include.members(['email']);
        expect(err.customValidation).to.include.members(['credit']);
        done();
      });
    });
  });

  context('normal excution', () => {
    const UserModel = createModel('User', {
      email: {
        type: types.VARCHAR(),
        required: true
      },
      password: {
        type: types.VARCHAR(),
        required: true
      }
    }, {
      tableName: testTableName
    });

    afterEach('remove the user', (done) => {
      db.none('DELETE from users where email=$1', ['bonjovi@mail.com'])
      .then(done)
      .catch(done);
    });

    it('return the newly created user instance', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        const newUser = yield user.save();

        expect(newUser.email).to.equal('bonjovi@mail.com');
        expect(newUser.password).to.equal('password');
      })
      .then(done)
      .catch(done);
    });

    it('updates the user itself', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        yield user.save();

        expect(user.email).to.equal('bonjovi@mail.com');
        expect(user.password).to.equal('password');
      })
      .then(done)
      .catch(done);
    });

    it('creates a new row in the database', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        yield user.save();

        const found = yield db.one('SELECT * from users where id=$1', [user.id]);
        expect(found.email).to.equal('bonjovi@mail.com');
        expect(found.password).to.equal('password');
      })
      .then(done)
      .catch(done);
    });

    it('updates the _data', (done) => {
      const user = new UserModel({
        email: 'bonjovi@mail.com',
        password: 'password'
      });

      co(function* () {
        yield user.save();
        expect(user._data.email).to.equal('bonjovi@mail.com');
        expect(user._data.password).to.equal('password');
        expect(user._data.id).to.equal(user.id);
      })
      .then(done)
      .catch(done);
    });
  });

  context('hooks', () => {
    const UserModel = createModel('User', {
      email: {
        type: types.VARCHAR(),
        required: true
      },
      password: {
        type: types.VARCHAR(),
        required: true
      },
      credit: {
        type: types.INTEGER,
        default: 10
      }
    }, {
      tableName: testTableName,
      preSave() {
        this.credit += 100;
        return Promise.resolve();
      },
      postSave() {
        this.email = 'aftersave@mail.com';
        return Promise.resolve();
      }
    });

    afterEach('remove the user', (done) => {
      db.none('DELETE from users where email=$1', ['bonjovi@mail.com'])
      .then(done)
      .catch(done);
    });

    it('runs preSave hook before', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        yield user.save();

        expect(user.credit).to.equal(110);

        const found = yield db.one('SELECT * FROM users WHERE id=$1', [user.id]);

        expect(found.credit).to.equal(110);
      })
      .then(done)
      .catch(done);
    });

    it('runs postSave hook after', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        yield user.save();

        expect(user.email).to.equal('aftersave@mail.com'); // postSave hook

        const found = yield db.one('SELECT * FROM users WHERE id=$1', [user.id]);

        expect(found.email).to.equal('bonjovi@mail.com'); // db entry un-modified
      })
      .then(done)
      .catch(done);
    });
  });
});


describe('update entry in database', () => {
  context('normal excution', () => {
    const UserModel = createModel('User', {
      email: {
        type: types.VARCHAR(),
        required: true
      },
      password: {
        type: types.VARCHAR(),
        required: true
      },
      credit: {
        type: types.INTEGER,
        validate(value) {
          return value > 10;
        }
      }
    }, {
      tableName: testTableName
    });

    afterEach('remove the user', (done) => {
      db.none('DELETE from users where email=$1', ['bonjovi@mail.com'])
      .then(done)
      .catch(done);
    });

    it('updates the information in the database', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        yield user.save();

        yield user.update({
          password: 'passwordnew',
          credit: 100
        });

        const found = yield db.one('SELECT * from users WHERE id=$1', [user.id]);

        expect(found.email).to.equal('bonjovi@mail.com');
        expect(found.password).to.equal('passwordnew');
        expect(found.credit).to.equal(100);
      })
      .then(done)
      .catch(done);
    });

    it('returns the instance itself reflecting the updates', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        yield user.save();

        const updatedUser = yield user.update({
          password: 'passwordnew',
          credit: 100
        });

        const found = yield db.one('SELECT * from users WHERE id=$1', [user.id]);

        expect(found.email).to.equal(updatedUser.email);
        expect(found.password).to.equal(updatedUser.password);
        expect(found.credit).to.equal(updatedUser.credit);
      })
      .then(done)
      .catch(done);
    });

    it('updates the instance itself', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        yield user.save();

        yield user.update({
          password: 'passwordnew',
          credit: 100
        });

        const found = yield db.one('SELECT * from users WHERE id=$1', [user.id]);

        expect(found.email).to.equal(user.email);
        expect(found.password).to.equal(user.password);
        expect(found.credit).to.equal(user.credit);
      })
      .then(done)
      .catch(done);
    });

    it('updates the _data', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });
        yield user.save();

        const updatedUser = yield user.update({
          password: 'passwordnew',
          credit: 100
        });

        const found = yield db.one('SELECT * from users WHERE id=$1', [user.id]);

        expect(found.username).to.equal(user._data.username);
        expect(found.email).to.equal(user._data.email);
        expect(found.password).to.equal(user._data.password);

        expect(found.username).to.equal(updatedUser._data.username);
        expect(found.email).to.equal(updatedUser._data.email);
        expect(found.password).to.equal(updatedUser._data.password);
      })
      .then(done)
      .catch(done);
    });
  });

  context('validations', () => {
    const UserModel = createModel('User', {
      email: {
        type: types.VARCHAR(),
        required: true
      },
      password: {
        type: types.VARCHAR(),
        required: true
      },
      credit: {
        type: types.INTEGER,
        validate(value) {
          return value > 10;
        }
      }
    }, {
      tableName: testTableName
    });

    afterEach('remove the user', (done) => {
      db.none('DELETE from users where email=$1', ['bonjovi@mail.com'])
      .then(done)
      .catch(done);
    });

    it('throws error if the instance has not been saved', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });

        yield user.update({
          password: 'passwordnew'
        });
      })
      .then(done)
      .catch((err) => {
        expect(err.name).to.equal('InstanceError');
        expect(err.message).to.equal('This instance has not been saved yet');
        done();
      });
    });

    it('ignores invalid fields in the updates', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });

        yield user.save();

        yield user.update({
          unknown: 'unknowfield',
          password: 'passwordnew'
        });

        const found = yield db.one('SELECT * from users WHERE id=$1', [user.id]);

        expect(found.email).to.equal('bonjovi@mail.com');
        expect(found.password).to.equal('passwordnew');
        expect(found.unknown).to.be.undefined;
      })
      .then(done)
      .catch(done);
    });

    it('runs basic type validations on the updates', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });

        yield user.save();

        yield user.update({
          password: 123123123123123
        });
      })
      .then(done)
      .catch((err) => {
        expect(err.name).to.equal('ValidationError');
        expect(err.attr).to.include.members(['password']);
        expect(err.typeValidation).to.include.members(['password']);
        done();
      });
    });

    it('runs custom schema validation functions on the udpates', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });

        yield user.save();

        yield user.update({
          credit: 9
        });
      })
      .then(done)
      .catch((err) => {
        expect(err.name).to.equal('ValidationError');
        expect(err.attr).to.include.members(['credit']);
        expect(err.customValidation).to.include.members(['credit']);
        done();
      });
    });
  });

  context('hooks', () => {
    const UserModel = createModel('User', {
      email: {
        type: types.VARCHAR(),
        required: true
      },
      password: {
        type: types.VARCHAR(),
        required: true
      },
      credit: {
        type: types.INTEGER,
        validate(value) {
          return value > 10;
        }
      }
    }, {
      tableName: testTableName,
      preUpdate(updates) {
        if (this.password !== updates.password) {
          updates.password = 'preupdatepassword';
        }
        return Promise.resolve();
      },
      postUpdate() {
        this.email = 'afterupdate@mail.com';
        return Promise.resolve();
      }
    });

    afterEach('remove the user', (done) => {
      db.none('DELETE from users where email=$1', ['bonjovi@mail.com'])
      .then(done)
      .catch(done);
    });

    it('runs preUpdate hook before', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });

        yield user.save();

        yield user.update({
          password: 'passwordnew'
        });

        expect(user.password).to.equal('preupdatepassword');

        const found = yield db.one('SELECT * FROM users where id=$1', [user.id]);

        expect(found.password).to.equal('preupdatepassword');
      })
      .then(done)
      .catch(done);
    });

    it('runs postUpdate hook after', (done) => {
      co(function* () {
        const user = new UserModel({
          email: 'bonjovi@mail.com',
          password: 'password'
        });

        yield user.save();

        yield user.update({
          password: 'passwordnew'
        });

        expect(user.email).to.equal('afterupdate@mail.com');

        const found = yield db.one('SELECT * FROM users where id=$1', [user.id]);

        expect(found.email).to.equal('bonjovi@mail.com');
      })
      .then(done)
      .catch(done);
    });
  });
});


describe('delete entry in database and isSaved method', () => {
  const UserModel = createModel('User', {
    email: {
      type: types.VARCHAR(),
      required: true
    },
    password: {
      type: types.VARCHAR(),
      required: true
    }
  }, {
    tableName: testTableName,
    preDelete() {
      this.something = true;
      return Promise.resolve();
    },
    postDelete() {
      this.otherthing = true;
      return Promise.resolve();
    }
  });

  it('throws error if the instance is not saved yet', (done) => {
    co(function* () {
      const user = new UserModel({
        email: 'bonjovi@mail.com',
        password: 'password'
      });

      expect(user.isSaved).to.be.false;

      yield user.delete();
    })
    .then(done)
    .catch((err) => {
      expect(err.name).to.equal('InstanceError');
      expect(err.message).to.equal('This instance has not been saved yet');
      done();
    });
  });

  it('removes the database entry', (done) => {
    co(function* () {
      const user = new UserModel({
        email: 'bonjovi@mail.com',
        password: 'password'
      });
      yield user.save();

      expect(user.isSaved).to.be.true;

      yield user.delete();

      const result = yield db.any('SELECT * from users WHERE email=$1', ['bonjovi@mail.com']);

      expect(result).to.be.empty;
      expect(user.isSaved).to.be.false;
    })
    .then(done)
    .catch(done);
  });

  it('set updatedAt when softDelete is true', (done) => {
    co(function* () {
      const user = new UserModel({
        username: 'bonjovi',
        email: 'bonjovi@mail.com',
        password: 'password'
      });
      yield user.save();

      expect(user.isSaved).to.be.true;
      expect(user.deletedAt).to.not.exist;

      yield user.delete({ softDelete: true });

      expect(user.isSaved).to.be.false;
      expect(user.deletedAt).to.exist;

      const found = yield db.one('SELECT * from users WHERE email=$1', ['bonjovi@mail.com']);
      expect(found.deletedAt.toISOString()).to.equal(user.deletedAt.toISOString());

      yield db.none('DELETE FROM users WHERE email=$1', ['bonjovi@mail.com']);
    })
    .then(done)
    .catch(done);
  });

  it('runs preDelete before', (done) => {
    co(function* () {
      const user = new UserModel({
        username: 'bonjovi',
        email: 'bonjovi@mail.com',
        password: 'password'
      });
      yield user.save();

      expect(user.isSaved).to.be.true;
      expect(user.something).to.be.undefined;

      yield user.delete();

      expect(user.isSaved).to.be.false;
      expect(user.something).to.be.true;
    })
    .then(done)
    .catch(done);
  });

  it('runs postDelete after', (done) => {
    co(function* () {
      const user = new UserModel({
        username: 'bonjovi',
        email: 'bonjovi@mail.com',
        password: 'password'
      });
      yield user.save();

      expect(user.isSaved).to.be.true;
      expect(user.otherthing).to.be.undefined;

      yield user.delete();

      expect(user.isSaved).to.be.false;
      expect(user.otherthing).to.be.true;
    })
    .then(done)
    .catch(done);
  });
});


describe('instance.selfie', () => {
  const UserModel = createModel('User', {
    email: {
      type: types.VARCHAR(),
      required: true
    },
    password: {
      type: types.VARCHAR(),
      required: true
    }
  }, {
    tableName: testTableName
  });

  it('returns an empty object when instance is not saved', () => {
    const user = new UserModel({
      email: 'bonjovi@mail.com',
      password: 'password'
    });

    expect(user.selfie).to.be.a('object');
    expect(user.selfie).to.be.empty;
  });

  it('returns the correct selfie after instance is saved', (done) => {
    co(function* () {
      const user = new UserModel({
        email: 'bonjovi@mail.com',
        password: 'password'
      });
      expect(user.selfie.id).to.not.exist;

      yield user.save();

      user.password = 'passwordnew';

      expect(user.selfie).to.be.a('object');
      expect(user.password).to.equal('passwordnew');
      expect(user.selfie.password).to.equal('password');
      expect(user.selfie.email).to.equal('bonjovi@mail.com');
      expect(user.selfie.id).to.exist;

      yield user.update({
        password: 'passwordnew'
      });

      expect(user.selfie).to.be.a('object');
      expect(user.selfie.password).to.equal('passwordnew');
      expect(user.password).to.equal('passwordnew');

      yield user.delete(); // test done, remove the row in db
    })
    .then(done)
    .catch(done);
  });

  it('returns an empty object after instance is soft deleted', (done) => {
    co(function* () {
      const user = new UserModel({
        email: 'bonjovi@mail.com',
        password: 'password'
      });

      yield user.save();

      expect(user.selfie).to.be.a('object');
      expect(user.selfie.email).to.equal('bonjovi@mail.com');
      expect(user.selfie.password).to.equal('password');

      yield user.delete({ softDelete: true });

      expect(user.selfie).to.be.a('object');
      expect(user.selfie).to.be.empty;

      yield db.none('DELETE FROM users WHERE email=$1', ['bonjovi@mail.com']); // test done, remove the row in db
    })
    .then(done)
    .catch(done);
  });

  it('returns an empty object after instance is deleted', (done) => {
    co(function* () {
      const user = new UserModel({
        email: 'bonjovi@mail.com',
        password: 'password'
      });

      yield user.save();

      expect(user.selfie).to.be.a('object');
      expect(user.selfie.email).to.equal('bonjovi@mail.com');
      expect(user.selfie.password).to.equal('password');

      yield user.delete();

      expect(user.selfie).to.be.a('object');
      expect(user.selfie).to.be.empty;
    })
    .then(done)
    .catch(done);
  });
});


describe('timestamps option', () => {
  const UserModel = createModel('User', {
    email: {
      type: types.VARCHAR(),
      required: true
    },
    password: {
      type: types.VARCHAR(),
      required: true
    }
  }, {
    tableName: testTableName,
    timestamps: true
  });

  const user = new UserModel({
    email: 'bonjovi@mail.com',
    password: 'password'
  });

  it('should not have timestamps before save', () => {
    expect(user.createdAt).to.not.exist;
    expect(user.updatedAt).to.not.exist;
  });

  it('generates createdAt and updatedAt values after save', (done) => {
    co(function* () {
      yield user.save();
      expect(user.createdAt).to.exist;
      expect(user.updatedAt).to.exist;

      expect(user.createdAt.constructor).to.equal(Date);
      expect(user.updatedAt.constructor).to.equal(Date);

      yield user.delete();
    })
    .then(done)
    .catch(done);
  });
});


describe('custom instance methods', () => {
  const UserModel = createModel('User', {
    email: {
      type: types.VARCHAR(),
      required: true
    },
    password: {
      type: types.VARCHAR(),
      required: true
    }
  }, {
    tableName: testTableName,
    instanceMethods: {
      selfie() {
        return {
          unknown: 'unknown'
        };
      },
      isGood() {
        return this.email === 'bonjovi@mail.com';
      }
    }
  });

  const user = new UserModel({
    email: 'bonjovi@mail.com',
    password: 'password'
  });

  it('attaches instance methods with `this` binded to the instance', () => {
    expect(user.isGood).to.exist;
    expect(user.isGood).to.be.a('function');
  });

  it('does not overwrite default instance properties', () => {
    expect(user.selfie).to.exist;

    expect(user.selfie.unknown).to.not.exist;
  });
});

describe('syncTable(force=false)', () => {
  const UserModel = createModel('User', {
    email: {
      type: types.VARCHAR(),
      required: true
    },
    password: {
      type: types.VARCHAR(),
      required: true
    },
    credit: {
      type: types.INTEGER,
      validate(value) {
        return value > 10;
      }
    }
  }, {
    tableName: 'syncTest'
  });

  afterEach('cleanup tables', (done) => {
    db.none('DROP TABLE IF EXISTS $1~', 'syncTest')
    .then(done)
    .catch(done);
  });

  beforeEach('cleanup tables', (done) => {
    db.none('DROP TABLE IF EXISTS $1~', 'syncTest')
    .then(done)
    .catch(done);
  });

  // travis unhappy about these three tests
  it('does nothing if force is false', (done) => {
    co(function* () {
      yield UserModel.syncTable();
      const found = yield db.any('SELECT * FROM information_schema.columns WHERE table_name=$1', ['syncTest']);
      expect(found.length).to.equal(0);
    })
    .then(done)
    .catch(done);
  });

  it('creates a new table if force is true', (done) => {
    co(function* () {
      yield UserModel.syncTable(true);

      const found = yield db.any('SELECT * FROM information_schema.columns WHERE table_name=$1', ['syncTest']);
      expect(found.length).to.equal(4);
      const columnNames = found.map(i => i.column_name);
      expect(columnNames).to.include.members(['id', 'email', 'password', 'credit']);
      // TODO criteria test, primiay null etc.
    })
    .then(done)
    .catch(done);
  });

  it('drop the table if exists and creates a new table if force is true', (done) => {
    co(function* () {
      yield db.none('CREATE TABLE $1~ (id integer)', 'syncTest');

      const beforeSync = yield db.any('SELECT * FROM information_schema.columns WHERE table_name=$1', ['syncTest']);
      expect(beforeSync.length).to.equal(1);
      expect(beforeSync[0].column_name).to.equal('id');

      yield UserModel.syncTable(true);

      const found = yield db.any('SELECT * FROM information_schema.columns WHERE table_name=$1', ['syncTest']);
      expect(found.length).to.equal(4);
      const columnNames = found.map(i => i.column_name);
      expect(columnNames).to.include.members(['id', 'email', 'password', 'credit']);
      // TODO criteria test, primiay null etc.
    })
    .then(done)
    .catch(done);
  });
});

describe('findOne', () => {
  const UserModel = createModel('User', {
    email: {
      type: types.VARCHAR(),
      required: true
    },
    password: {
      type: types.VARCHAR(),
      required: true
    }
  }, {
    tableName: testTableName
  });

  let user;
  beforeEach('create a test user', (done) => {
    user = new UserModel({
      email: 'bonjovi@mail.com',
      password: 'password'
    });

    user.save().then(() => done()).catch(done);
  });

  it('rejects a ModelError if parameters are wrong', (done) => {
    UserModel.findOne()
    .catch((err) => {
      expect(err.name).to.equal('ModelError');
      expect(err.message).to.equal('Usage: User.findOne(name, value)');
      done();
    });
  });

  it('returns null when nothing found', (done) => {
    UserModel.findOne('email', 'unknown@mail.com')
    .then((res) => {
      expect(res).to.be.null;
      done();
    })
    .catch(done);
  });

  it('returns the user instance when found', (done) => {
    UserModel.findOne('email', 'bonjovi@mail.com')
    .then((found) => {
      expect(found).to.exist;
      expect(found.constructor).to.equal(UserModel);
      expect(found.email).to.equal('bonjovi@mail.com');
      expect(found.isSaved).to.be.true;
      expect(found.selfie.email).to.equal('bonjovi@mail.com');

      done();
    })
    .catch(done);
  });

  it('returns the only one user when multiple exist', (done) => {
    co(function* () {
      const another = new UserModel({
        email: 'another@mail.com',
        password: 'password'
      });
      yield another.save();

      const found = yield UserModel.findOne('password', 'password');
      expect(found).to.exist;
      expect(found.constructor).to.equal(UserModel);
      expect(found.email).to.equal('bonjovi@mail.com');
      expect(found.isSaved).to.be.true;
      expect(found.selfie.email).to.equal('bonjovi@mail.com');

      yield another.delete();
    })
    .then(done)
    .catch(done);
  });

  afterEach('remove the test user', (done) => {
    user.delete().then(() => done()).catch(done);
  });
});


describe('custom model methods', () => {
  const UserModel = createModel('User', {
    email: {
      type: types.VARCHAR(),
      required: true
    },
    password: {
      type: types.VARCHAR(),
      required: true
    }
  }, {
    tableName: testTableName,
    modelMethods: {
      getName() {
        return this.name;
      },
      findOne(name, value) {
        return new Promise((resolve) => {
          resolve(name + value);
        });
      }
    }
  });

  it('attaches model methods with `this` binded to the model', () => {
    expect(UserModel.getName).to.be.a('function');

    const res = UserModel.getName();

    expect(res).to.equal('User');
  });

  it('does not overwrite default model properties', (done) => {
    expect(UserModel.findOne).to.be.a('function');


    UserModel.findOne('email', 'value')
    .then((res) => {
      expect(res).to.not.equal('emailvalue');
      expect(res).to.be.null;
      done();
    })
    .catch(done);
  });
});
