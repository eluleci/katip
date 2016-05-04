#!/usr/bin/env node
require('shelljs/global');
var jsonfile = require('jsonfile')
var sleep = require('sleep')
var dateFormat = require('dateformat')

var isRunning = false
var CHECK_PERIOD = 30

if (!which('git')) {
  echo('Sorry, this script requires git');
  exit(1);
}

var DIR = pwd().stdout                  // path of current directory
var PIPELINES_DIR = DIR + '/pipelines/' // path to put pipeline folders

run()

function run() {

  var config
  try {
    config = jsonfile.readFileSync('config.json')
  } catch(err) {
    log('Error: ' + err)
  }

  while(true) {

    config.pipelines.forEach(function(pipeline){
      if(hasProjectChanged(pipeline)) {
        log('There is a change in the project ' + pipeline.name + '. Starting the pipeline.')
        handlePipeline(pipeline)
      } else {
        log('There is no change in the project ' + pipeline.name)
      }
    })

    sleep.sleep(CHECK_PERIOD)
  }
}

/**
 * Checks pipeline history and triggers handlePipeline() if there is a change
 * in the project.
 */
function hasProjectChanged(pipeline) {
  log('Checking for changes for project ' + pipeline.name)

  var history = getHistory()
  var pipelineHistory = history[pipeline.domain]

  // if there is no record in the history yet, return true for initial run
  if (!pipelineHistory) {
    return true
  }

  var lastLog = pipelineHistory[pipelineHistory.length - 1]

  var pipelineSrcDir = PIPELINES_DIR + pipeline.domain+ '/src'
  cd(pipelineSrcDir)

  exec('git checkout ' + pipeline.vc.branch, {silent:true})
  var commitHash = exec('git rev-parse --verify HEAD', {silent:true}).stdout
  commitHash = commitHash.substring(0, commitHash.length - 1)

  return lastLog.commitHash != commitHash
}

function handlePipeline(pipeline) {
  log('PIPELINE: ' + pipeline.name)

  var pipelineDir = PIPELINES_DIR + pipeline.domain

  // initialise object to store logs for this current run
  var pipelineLog = {stages:[]}
  pipelineLog.start = new Date()

  // delete the existing folder and create new folder
  rm('-rf', pipelineDir);
  mkdir('-p', pipelineDir)
  cd(pipelineDir)

  // clone the project into folder named 'src'
  if (exec('git clone ' + pipeline.src + ' src').code !== 0) {
    pipelineLog.error = {message: 'Git clone failed'}
    echo('Error: Git clone failed');
    exit(1);
  }

  // enter and continue in the project source directory
  cd(pipelineDir + '/src')

  // switch to the specified branch
  log("Switching to branch '" + pipeline.vc.branch + "'")
  exec('git checkout ' + pipeline.vc.branch)

  // get the last commit hash and trim the \n character at the end
  pipelineLog.commitHash = exec('git rev-parse --verify HEAD', {silent:true}).stdout
  pipelineLog.commitHash = pipelineLog.commitHash.substring(0, pipelineLog.commitHash.length - 1)

  pipeline.stages.forEach(function(stage){
    pipelineLog.stages.push(handleStage(stage))
  })

  if (pipeline.artifacts) {
    exportArtifacts(pipeline, pipelineDir)
  }

  pipelineLog.end = new Date()
  pipelineLog.elapsed = pipelineLog.end - pipelineLog.start
  log('END PIPELINE - ' + pipelineLog.elapsed + 'ms : ' + pipeline.name)
  updateHistory(pipeline.domain, pipelineLog)
}

function handleStage(stage) {
  log('STAGE: ' + stage.name)
  var stageLog = {name: stage.name, jobs: []}
  stageLog.start = new Date()

  stage.jobs.forEach(function(job){
    stageLog.jobs.push(handleJob(job))
  })

  stageLog.end = new Date()
  stageLog.elapsed = stageLog.end - stageLog.start
  log('END STAGE - ' + stageLog.elapsed + 'ms : ' + stage.name)
  return stageLog
}

function handleJob(job) {
  log('JOB: ' + job.name)
  var jobLog = {name: job.name, tasks: []}
  jobLog.start = new Date()

  job.tasks.forEach(function(task){
    jobLog.tasks.push(handleTask(task))
  })

  jobLog.end = new Date()
  jobLog.elapsed = jobLog.end - jobLog.start
  log('END JOB - ' + jobLog.elapsed + 'ms : ' + job.name)
  return jobLog
}

function handleTask(task) {
    log('TASK: ' + task.cmd)
    var taskLog = {name: task.cmd}
    taskLog.start = new Date()

    if (exec(task.cmd).code !== 0) {
      echo("Error: Executing the command '" + task.cmd + "' failed.");
      taskLog.status = 'failed'
    }

    taskLog.status = 'success'
    taskLog.end = new Date()
    taskLog.elapsed = taskLog.end - taskLog.start
    log('END TASK - ' + taskLog.elapsed + 'ms : ' + task.cmd)
    return taskLog
}

function exportArtifacts(pipeline, pipelineDir) {
    log('Exporting artifacts...')

    pipeline.artifacts.forEach(function(artifact) {
      var sourcePath = pipelineDir + '/src/' + artifact.src
      var artifactPath = pipelineDir + '/artifacts/' + artifact.dst
      try{
        var files = ls(sourcePath)
      } catch(err) {
        log(err)
      }

      mkdir('-p', artifactPath)
      files.forEach(function(file){
        cp(file, artifactPath)
      })
    })
}

function getHistory() {

    var history = {}
    try {
      history = jsonfile.readFileSync(DIR + '/history.json')
    } catch(err) {
      // file not found
    }
    return history
}

function updateHistory(domain, data) {

  var history = getHistory()

  // initialise history for this domain if it doesn't exist in history
  if (!history[domain]) history[domain] = []

  // append new data to the history
  history[domain].push(data)

  // save the history file
  jsonfile.writeFileSync(DIR + '/history.json', history)
}

function log(message) {
  console.log(dateFormat(new Date(), "dd-mm-yyyy HH:MM:ss.l") + ' ' + message)
}
