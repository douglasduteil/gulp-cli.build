'use strict';

var fs = require('fs');

var log = require('gulplog');
var chalk = require('chalk');
var stdout = require('mute-stdout');
var tildify = require('tildify');

var exit = require('../../shared/exit');

var logTasks = require('../../shared/log/tasks');
var logEvents = require('./log/events');
var logSyncTask = require('./log/syncTask');
var logTasksSimple = require('./log/tasksSimple');

function execute(opts, env) {

  var tasks = opts._;
  var toRun = tasks.length ? tasks : ['default'];

  if (opts.tasksSimple || opts.tasks || opts.tasksJson) {
    // Mute stdout if we are listing tasks
    stdout.mute();
  }

  var gulpInst = require(env.modulePath);
  logEvents(gulpInst);
  logSyncTask(gulpInst);

  // This is what actually loads up the gulpfile
  require(env.configPath);

  // Always unmute stdout after gulpfile is required
  stdout.unmute();

  process.nextTick(function() {
    if (opts.tasksSimple) {
      return logTasksSimple(gulpInst.tree());
    }
    if (opts.tasks) {
      var tree = {
        label: 'Tasks for ' + chalk.magenta(tildify(env.configPath)),
        nodes: gulpInst.tree({ deep: true }),
      };
      return logTasks(tree, function(task) {
        return gulpInst.task(task).description;
      });
    }
    if (opts.tasksJson) {
      var output = JSON.stringify(gulpInst.tree({ deep: true }));
      if (typeof opts.tasksJson === 'boolean' && opts.tasksJson) {
        return console.log(output);
      } else {
        return fs.writeFileSync(opts.tasksJson, output, 'utf-8');
      }
    }
    try {
      log.info('Using gulpfile', chalk.magenta(tildify(env.configPath)));
      gulpInst.parallel(toRun)(function(err) {
        if (err) {
          exit(1);
        }
      });
    } catch (err) {
      log.error(chalk.red(err.message));
      log.error(
        'Please check the documentation for proper gulpfile formatting'
      );
      exit(1);
    }
  });
}

module.exports = execute;
