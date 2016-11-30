/* global describe, it, context, before, beforeEach, after, afterEach */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const co = require('co');

const config = require('./config')[process.env.NODE_ENV || 'test'];

const { createModel, db } = require('../src/')(config);

before('check testing table', (done) => {
  co(function* () {
    const result = yield db.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2)', ['public', 'users']);
    if (!result.exists) {
      yield db.none(`
        CREATE TABLE users (id SERIAL,
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
      type: String
    },
    credit: {
      type: Number,
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
        type: String,
        required: true
      },
      credit: {
        type: Number,
        default: 100,
        validate(value) {
          return value >= 100;
        }
      }
    });

    it('runs basic type validation', (done) => {
      const user = new UserModel({
        email: 123456,
        credit: 'what'
      });

      user.save()
      .catch((err) => {
        expect(err.name).to.equal('ValidationError');
        expect(err.message).to.equal('User schema validation error');
        expect(err.attr).to.include.members(['email', 'credit']);
        expect(err.typeValidation).to.include.members(['email', 'credit']);
        done();
      });
    });

    it('runs required validation', (done) => {
      const user = new UserModel({
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
        credit: 'okay then'
      });

      user.save()
      .catch((err) => {
        expect(err.name).to.equal('ValidationError');
        expect(err.message).to.equal('User schema validation error');
        expect(err.attr).to.include.members(['email', 'credit']);
        expect(err.requiredValidation).to.include.members(['email']);
        expect(err.customValidation).to.include.members(['credit']);
        done();
      });
    });
  });

  context('normal excution', () => {
    const UserModel = createModel('User', {
      email: {
        type: String,
        required: true
      },
      password: {
        type: String,
        required: true
      }
    }, {
      tableName: 'users'
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
        type: String,
        required: true
      },
      password: {
        type: String,
        required: true
      },
      credit: {
        type: Number,
        default: 10
      }
    }, {
      tableName: 'users',
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
        type: String,
        required: true
      },
      password: {
        type: String,
        required: true
      },
      credit: {
        type: Number,
        validate(value) {
          return value > 10;
        }
      }
    }, {
      tableName: 'users'
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
        type: String,
        required: true
      },
      password: {
        type: String,
        required: true
      },
      credit: {
        type: Number,
        validate(value) {
          return value > 10;
        }
      }
    }, {
      tableName: 'users'
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
        type: String,
        required: true
      },
      password: {
        type: String,
        required: true
      },
      credit: {
        type: Number,
        validate(value) {
          return value > 10;
        }
      }
    }, {
      tableName: 'users',
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
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    }
  }, {
    tableName: 'users',
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
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    }
  }, {
    tableName: 'users'
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

describe('custom instance methods', () => {

});

describe('custom static methods', () => {

});