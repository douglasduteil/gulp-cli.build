#!/usr/bin/env node

'use strict';
var fs = require('fs');
var path = require('path');
var log = require('gulplog');
var chalk = require('chalk');
var yargs = require('yargs');
var Liftoff = require('liftoff');
var tildify = require('tildify');
var interpret = require('interpret');
var v8flags = require('v8flags');
var findRange = require('semver-greatest-satisfied-range');
var exit = require('./lib/shared/exit');
var cliOptions = require('./lib/shared/cliOptions');
var completion = require('./lib/shared/completion');
var verifyDeps = require('./lib/shared/verifyDependencies');
var cliVersion = require('./package.json').version;
var getBlacklist = require('./lib/shared/getBlacklist');
var toConsole = require('./lib/shared/log/toConsole');

// Logging functions
var logVerify = require('./lib/shared/log/verify');
var logBlacklistError = require('./lib/shared/log/blacklistError');

// Get supported ranges
var ranges = fs.readdirSync(__dirname + '/lib/versioned/');

// Set env var for ORIGINAL cwd
// before anything touches it
process.env.INIT_CWD = process.cwd();

var cli = new Liftoff({
  name: 'gulp-4.0.build',
  completions: completion,
  extensions: interpret.jsVariants,
  v8flags: v8flags,
});

var usage =
  '\n' + chalk.bold('Usage:') +
  ' gulp ' + chalk.blue('[options]') + ' tasks';

var parser = yargs.usage(usage, cliOptions);
var opts = parser.argv;

// This translates the --continue flag in gulp
// To the settle env variable for undertaker
// We use the process.env so the user's gulpfile
// Can know about the flag
if (opts.continue) {
  process.env.UNDERTAKER_SETTLE = 'true';
}

// Set up event listeners for logging.
toConsole(log, opts);

cli.on('require', function(name) {
  log.info('Requiring external module', chalk.magenta(name));
});

cli.on('requireFail', function(name) {
  log.error(chalk.red('Failed to load external module'), chalk.magenta(name));
});

cli.on('respawn', function(flags, child) {
  var nodeFlags = chalk.magenta(flags.join(', '));
  var pid = chalk.magenta(child.pid);
  log.info('Node flags detected:', nodeFlags);
  log.info('Respawned to PID:', pid);
});

function run() {
  cli.launch({
    cwd: opts.cwd,
    configPath: opts.gulpfile,
    require: opts.require,
    completion: opts.completion,
  }, handleArguments);
}

module.exports = run;

// The actual logic
function handleArguments(env) {
  if (opts.help) {
    console.log(parser.help());
    exit(0);
  }

  if (opts.version) {
    log.info('CLI version', cliVersion);
    if (env.modulePackage && typeof env.modulePackage.version !== 'undefined') {
      log.info('Local version', env.modulePackage.version);
    }
    exit(0);
  }

  if (opts.verify) {
    var pkgPath = opts.verify !== true ? opts.verify : 'package.json';
    if (path.resolve(pkgPath) !== path.normalize(pkgPath)) {
      pkgPath = path.join(env.configBase, pkgPath);
    }
    log.info('Verifying plugins in ' + pkgPath);
    return getBlacklist(function(err, blacklist) {
      if (err) {
        return logBlacklistError(err);
      }

      var blacklisted = verifyDeps(require(pkgPath), blacklist);

      logVerify(blacklisted);
    });
  }

  if (!env.modulePath) {
    log.error(
      chalk.red('Local gulp not found in'),
      chalk.magenta(tildify(env.cwd))
    );
    log.error(chalk.red('Try running: npm install gulp'));
    exit(1);
  }

  if (!env.configPath) {
    log.error(chalk.red('No gulpfile found'));
    exit(1);
  }

  // Chdir before requiring gulpfile to make sure
  // we let them chdir as needed
  if (process.cwd() !== env.cwd) {
    process.chdir(env.cwd);
    log.info(
      'Working directory changed to',
      chalk.magenta(tildify(env.cwd))
    );
  }

  // Find the correct CLI version to run
  var range = findRange(env.modulePackage.version, ranges);

  if (!range) {
    return log.error(
      chalk.red('Unsupported gulp version', env.modulePackage.version)
    );
  }

  // Load and execute the CLI version
  require(path.join(__dirname, '/lib/versioned/', range, '/'))(opts, env);
}
