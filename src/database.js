const sqlite3 = require('sqlite3').verbose();
var db;

exports.setup = dbPath => {
  sqlite3.Database.prototype.runAsync = function (sql, params) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    });
  };

  sqlite3.Database.prototype.getAsync = function (sql,params) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, function (err, row) {
        if (err) return reject(err);
        resolve(row);
      });
    });
  };

  sqlite3.Database.prototype.allAsync = function (sql,params) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, function (err, rows) {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  };

  db = new sqlite3.Database(dbPath);

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS connections (
      connection_id INTEGER PRIMARY KEY AUTOINCREMENT,
      management_server_user_id INTEGER,

      https_port INTEGER UNIQUE, /* This is what's used for nginx  reverse proxy.  Should not be revealed to outside services*/
      port_port INTEGER UNIQUE, /* This is what's used for minecraft, will be made public to user*/

      full_domain VARCHAR UNIQUE NOT NULL,
      domain VARCHAR NOT NULL,
      subdomain VARCHAR NOT NULL,
      frp_password VARCHAR,
      frp_bind_port INTEGER UNIQUE, /* Port FRP listens to incoming connections on.  Public to user */
      frp_process_id VARCHAR,

      disabled INTEGER DEFAULT 0,
      disabled_date DATETIME,

      modified DATETIME DEFAULT CURRENT_TIMESTAMP,
      created DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  );
}

exports.getDb = () => {
  return db;
}

exports.getFreshSql = (dbPath) => {
  return new sqlite3.Database(dbPath);
}