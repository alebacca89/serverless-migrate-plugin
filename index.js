'use strict';

const migrate = require('migrate');
const dateFormat = require('dateformat');
const chalk = require('chalk');
const gen = require('migrate/lib/template-generator');
const path = require('path');

const migrateLibPath = path.dirname(require.resolve('migrate'));

const DEFAULT_MIGRATION_STORE = path.join(migrateLibPath, 'lib', 'file-store');
const DEFAULT_MIGRATION_STATE_FILE = '.migrate';
const DEFAULT_MIGRATION_EXTENSION = '.js';

class MigratePlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    const commonOptions = {
      'state-file': {
        usage: `Set the path of the state file (default: "${DEFAULT_MIGRATION_STATE_FILE}")`,
        shortcut: 'f',
      },
      store: {
        usage: `Set the migrations store (default: "${DEFAULT_MIGRATION_STORE}")`,
        shortcut: 's',
      },
      'date-format': {
        usage: 'Set a date format to use. By default it is yyyy-mm-dd.',
        shortcut: 'd',
      },
      'file-extension': {
        usage: `Specifies the extension of the migration files. By default it is ${chalk.cyan('.js')}`,
        shortcut: 'x',
      },
    };

    const nameOption = {
      name: {
        usage: 'The migration name you want to move to',
        shortcut: 'n',
      },
    };

    this.commands = {
      migrate: {
        usage: 'Migrations management for Serverless',
        lifecycleEvents: ['help'],
        commands: {
          list: {
            lifecycleEvents: ['setup', 'run'],
            usage: 'List migrations and their status',
            options: {
              ...commonOptions,
            },
          },
          up: {
            lifecycleEvents: ['setup', 'run'],
            usage: 'Migrates up',
            options: {
              ...commonOptions,
              ...nameOption,
            },
          },
          down: {
            lifecycleEvents: ['setup', 'run'],
            usage: 'Migrates down',
            options: {
              ...commonOptions,
              ...nameOption,
            },
          },
          create: {
            lifecycleEvents: ['setup', 'run'],
            usage: 'Creates migration file',
            options: {
              'template-file': {
                usage: 'Set path to template file to use for new migrations',
                shortcut: 't',
              },
              ...commonOptions,
              ...nameOption,
            },
          },
        },
      },
    };

    this.hooks = {
      'migrate:help': this.displayHelp.bind(this),
      'migrate:list:setup': this.setupMigration.bind(this),
      'migrate:list:run': this.runCommand.bind(this, 'list'),
      'migrate:up:setup': this.setupMigration.bind(this),
      'migrate:up:run': this.runCommand.bind(this, 'up'),
      'migrate:down:setup': this.setupMigration.bind(this),
      'migrate:down:run': this.runCommand.bind(this, 'down'),
      'migrate:create:setup': this.setupMigration.bind(this),
      'migrate:create:run': this.runCommand.bind(this, 'create'),
    };

    this.config = this.serverless.service.custom ? this.serverless.service.custom.migrate : {};
    process.env = {
      ...process.env,
      ...this.serverless.service.provider.environment,
      ...this.config.environment,
    };
    process.env.SERVERLESS_ROOT_PATH = this.serverless.config.servicePath;
  }

  runCommand(cmd) {
    return this.migration.then(this[cmd].bind(this))
      .catch(console.error);
  }

  setupMigration() {
    this.migration = new Promise((resolve, reject) => {
      migrate.load({
        stateStore: this.stateStore,
        migrationsDirectory: this.config.migrationDir,
        ignoreMissing: this.config.ignoreMissing || false,
        filterFunction: this.filterByFileExtension.bind(this),
      }, (err, set) => {
        if (err) {
          reject(err);
        } else {
          resolve(set);
        }
      });
    });
  }

  up(set) {
    set.up(this.options.name, (err) => {
      if (err) {
        throw err;
      }

      console.log(`migration ${chalk.cyan('up')}: completed`);
    });
  }

  down(set) {
    set.down(this.options.name, (err) => {
      if (err) {
        throw err;
      }

      console.log(`migration ${chalk.cyan('down')}: completed`);
    });
  }

  list(set) {
    if (set.migrations.length === 0) {
      console.log('No Migrations were found! Please see run migrate create to add some.');
      process.exit(1);
    }

    set.migrations.forEach((m) => console.log(...this.getMigrationStatusData(m, set)));
  }

  create() {
    const migrationDir = this.config.migrationDir || 'migrations';
    const templateFile = this.config.templateFile || this.options['template-file'];

    gen({
      name: this.options.name,
      dateFormat: this.options['date-format'],
      templateFile,
      migrationsDirectory: migrationDir,
      extension: DEFAULT_MIGRATION_EXTENSION,
    }, (err, p) => {
      if (err) {
        console.error('Template generation error', err.message);
        process.exit(1);
      }
      console.log('create', p);
    });
  }

  getMigrationStatusData(migration, set) {
    const result = [migration.title];

    if (migration.timestamp) {
      result.push(chalk.cyan(`[${dateFormat(migration.timestamp, this.dateFormat)}]`));
    } else {
      result.push(chalk.cyan('[not run]'));
    }

    result.push(migration.description || this.config.noDescriptionText || '<No Description>');

    if (set.lastRun === migration.title) {
      result.push(chalk.green(this.config.lastRunIndicator || '<==='));
    }

    return result;
  }

  displayHelp() {
    this.serverless.cli.generateCommandsHelp(['migrate']);
  }

  get dateFormat() {
    return this.options['date-format'] || this.config.dateFormat || 'yyyy-mm-dd';
  }

  filterByFileExtension(file) {
    const fileExtension = this.options['file-extension']
      || this.config.fileExtension
      || DEFAULT_MIGRATION_EXTENSION;
    return file.endsWith(fileExtension);
  }

  get stateStore() {
    // eslint-disable-next-line global-require,import/no-dynamic-require
    const Store = require(this.storeClassPath);
    return new Store(this.stateFile);
  }

  get storeClassPath() {
    let storeClassPath = (this.options.store || this.config.store || '').trim();
    if (storeClassPath) {
      if (storeClassPath.startsWith('.')) {
        storeClassPath = path.join(process.cwd(), storeClassPath);
      }
      return storeClassPath;
    }

    return DEFAULT_MIGRATION_STORE;
  }

  get stateFile() {
    return this.options['state-file'] || this.config.stateFile || DEFAULT_MIGRATION_STATE_FILE;
  }
}

module.exports = MigratePlugin;
