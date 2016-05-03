#!/usr/bin/env node
require('shelljs/global');
var jsonfile = require('jsonfile')

if (!which('git')) {
  echo('Sorry, this script requires git');
  exit(1);
}

var DIR = pwd().stdout                  // path of current directory
var PIPELINES_DIR = DIR + '/pipelines/' // path to put pipeline folders

start()

function start() {
  try {
    var config = jsonfile.readFileSync('config.json')
    config.pipelines.forEach(function(pipeline){
      handlePipeline(pipeline)
    })
  } catch(err) {
    console.log('Error: ' + err)
  }
}

function handlePipeline(pipeline) {
  console.log('PIPELINE: ' + pipeline.name)

  var pipelineDir = PIPELINES_DIR + pipeline.package

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
  var srcDir = pipelineDir + '/src'
  cd(srcDir)

  // switch to the specified branch
  console.log("Switching to branch '" + pipeline.vc.branch + "'")
  exec('git checkout ' + pipeline.vc.branch)

  pipeline.stages.forEach(function(stage){
    pipelineLog.stages.push(handleStage(stage))
  })

  if (pipeline.artifacts) {
    exportArtifacts(pipeline, pipelineDir)
  }

  pipelineLog.end = new Date()
  pipelineLog.elapsed = pipelineLog.end - pipelineLog.start
  console.log('END PIPELINE - ' + pipelineLog.elapsed + 'ms : ' + pipeline.name)
  updateHistory(pipeline.package, pipelineLog)
}

function handleStage(stage) {
  console.log('STAGE: ' + stage.name)
  var stageLog = {name: stage.name, jobs: []}
  stageLog.start = new Date()

  stage.jobs.forEach(function(job){
    stageLog.jobs.push(handleJob(job))
  })

  stageLog.end = new Date()
  stageLog.elapsed = stageLog.end - stageLog.start
  console.log('END STAGE - ' + stageLog.elapsed + 'ms : ' + stage.name)
  return stageLog
}

function handleJob(job) {
  console.log('JOB: ' + job.name)
  var jobLog = {name: job.name, tasks: []}
  jobLog.start = new Date()

  job.tasks.forEach(function(task){
    jobLog.tasks.push(handleTask(task))
  })

  jobLog.end = new Date()
  jobLog.elapsed = jobLog.end - jobLog.start
  console.log('END JOB - ' + jobLog.elapsed + 'ms : ' + job.name)
  return jobLog
}

function handleTask(task) {
    console.log('TASK: ' + task.cmd)
    var taskLog = {name: task.cmd}
    taskLog.start = new Date()

    if (exec(task.cmd).code !== 0) {
      echo("Error: Executing the command '" + task.cmd + "' failed.");
      exit(1);
    }

    taskLog.end = new Date()
    taskLog.elapsed = taskLog.end - taskLog.start
    console.log('END TASK - ' + taskLog.elapsed + 'ms : ' + task.cmd)
    return taskLog
}

function exportArtifacts(pipeline, pipelineDir) {

    pipeline.artifacts.forEach(function(artifact){
      var sourcePath = pipelineDir + '/src/' + artifact.src
      var artifactPath = pipelineDir + '/artifacts/' + artifact.dst
      try{
        var files = ls(sourcePath)
      } catch(err) {
        console.log(err)
      }

      mkdir('-p', artifactPath)
      files.forEach(function(file){
        cp(file, artifactPath)
      })
    })
}

function updateHistory(package, data) {

  var history = {}
  try {
    history = jsonfile.readFileSync(DIR + '/history.json')
  } catch(err) {
    // file not found
  }

  // initialise history for this package if it doesn't exist in history
  if (!history[package]) history[package] = []

  // append new data to the history
  history[package].push(data)

  // save the history file
  jsonfile.writeFileSync(DIR + '/history.json', history)
}
