/* Modules */
require("./env"); // Load configuration variables

var cfg = {
  ssl: ( process.env.SSL_KEY && process.env.SSL_CERT),
  ssl_key: process.env.SSL_KEY,
  ssl_cert: process.env.SSL_CERT
}

var os = require("os");
var path = require("path");
var fs = require("mz/fs");
var spawn= require("child_process").spawn;
var spawnSync = require("child_process").spawnSync;
var EventEmitter = require("events").EventEmitter;
var mediator = new EventEmitter();

var httpServ = ( cfg.ssl ) ? require('https') : require('http');

var url = require("url");
var bytes = require("bytes");
var express = require("express");
var bodyParser = require("body-parser");
var morgan = require("morgan");
var cors = require("cors");
var Promise = require("bluebird");
var rp = require("request-promise");
var chokidar = require("chokidar");
var rimraf = require("rimraf");
var WebSocketServer = require("ws").Server;
var multer = require("multer");
var util  = require('util');
var spawn = require('child_process').spawn;

/* App instantiation */
var app = express();
var jsonParser = bodyParser.json({limit: "50mb"}); // Parses application/json
app.use(morgan("common")); // Log requests
var upload = multer();

// Variables
var specs = {};
var projects = {};
var experiments = {};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/* FGLab check */
if (!process.env.FGLAB_URL) {
  console.log("Error: No FGLab address specified");
  process.exit(1);
}

/* Machine specifications */
// Attempt to read existing specs
fs.readFile("specs.json", "utf-8")
.then((sp) => {
  specs = JSON.parse(sp);
})
.catch(() => {
  // Otherwise create specs
  specs = {
    address: process.env.FGMACHINE_URL,
    //hostname: os.hostname()+':'+Math.floor(Math.random() * 101),
    hostname: os.hostname(),
    os: {
      type: os.type(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release()
    },
    cpus: os.cpus().map((cpu) => cpu.model), // Fat arrow has implicit return
    mem: bytes(os.totalmem()),
    gpus: []
  };
  // GPU models
  if (os.platform() === "linux") {
    var lspci = spawnSync("lspci", []);
    var grep_vga = spawnSync("grep", ["-i", "vga"], {input: lspci.stdout});
    var grep = spawnSync("grep", ["-i", "nvidia"], {input: grep_vga.stdout});
    var gpuStrings = grep.stdout.toString().split("\n");
    for (var i = 0; i < gpuStrings.length - 1; i++) {
      specs.gpus.push(gpuStrings[i].replace(/.*controller: /g, ""));
    }
  } else if (os.platform() === "darwin") {
    var system_profiler = spawnSync("system_profiler", ["SPDisplaysDataType"]);
    var profilerStrings = system_profiler.stdout.toString().split("\n");
    for (var i = 0; i < profilerStrings.length - 1; i++) {
      if (profilerStrings[i].indexOf("Chipset Model:") > -1) {
        specs.gpus.push(profilerStrings[i].replace(/Chipset Model: /g, ""));
      }
    }
  }

  // Register details
  rp({uri: process.env.FGLAB_URL + "/api/v1/machines", method: "POST", json: specs, gzip: true,
    rejectUnauthorized: false,
    requestCert: false,
    agent: false,
    strictSSL: false,
    //proxy:"http://proxy.com:8080",
    tunnel: false })
  .then((body) => {
    console.log("Registered with FGLab successfully");
    // Save ID and specs
    fs.writeFile("specs.json", JSON.stringify(body, null, "\t"));
    // Reload specs with _id (prior to adding projects)
    specs = body;
    // Register projects
    rp({uri: process.env.FGLAB_URL + "/api/v1/machines/" + specs._id + "/projects", method: "POST", json: {projects: projects}, gzip: true})
    .then(() => {
      console.log("Projects registered with FGLab successfully");
    });
  })
  .catch((err) => {
    console.log("Failed to register with FGLab @ " + process.env.FGLAB_URL);
    console.log(err);
  });
})
.then(() => {
	if ("gpus" in specs) {
	  for (var i = 0; i < specs.gpus.length; i++) {
	    GPUsCapacity.push(1);
	  }
	  GPUCapacity = GPUsCapacity.reduce((a, b) => a + b, 0);
	}
});

/* Project specifications */
// Attempt to read existing projects
fs.readFile("projects.json", "utf-8")
.then((proj) => {
  console.log("Loaded projects");
  projects = JSON.parse(proj || "{}");
  // Register projects
  rp({uri: process.env.FGLAB_URL + "/api/v1/machines/" + specs._id + "/projects", method: "POST", json: {projects: projects}, gzip: true})
  .then(() => {
    console.log("Projects registered with FGLab successfully");
  })
  .catch(() => {}); // Ignore failure in case machine is not registered
})
.catch(() => {
  projects = {};
});

// Reload projects on change
chokidar.watch("projects.json").on("change", () => {
  fs.readFile("projects.json", "utf-8")
  .then((proj) => {
    console.log("Reloaded projects");
    projects = JSON.parse(proj || "{}");
    // Register projects
    rp({uri: process.env.FGLAB_URL + "/api/v1/machines/" + specs._id + "/projects", method: "POST", json: {projects: projects}, gzip: true})
    .then(() => {
      console.log("Projects registered with FGLab successfully");
    })
    .catch(() => {}); // Ignore failure in case machine is not registered
  });
});


/* Global max capacity */
var maxCapacity = 1;
var GPUsCapacity = [];
var GPUCapacity = 0;

// Checks if GPU resources are required
var isGPURequired = function(projId) {
  return "gpu_capacity" in projects[projId];
};

var getCapacity = function(projId) {
  var capacity = 0;
  if (projects[projId]) {
    capacity = Math.floor(maxCapacity / projects[projId].capacity);
    if (isGPURequired(projId)) {
      // if we have any GPUs 
      if (("gpus" in specs) && (specs.gpus.length > 0)) {
        var gpu_available_capacity = GPUsCapacity.reduce((a, b) => a + b, 0);
        var gpu_capacity = Math.floor(gpu_available_capacity / projects[projId].gpu_capacity);
        capacity = Math.min(gpu_capacity, capacity);
      } else {
        capacity = 0;
      }
    }
  }
  return capacity;
};

cors_config = {origin: process.env.FGLAB_URL}

if (process.env.FGLABPUBLIC_URL) {
  cors_config = {origin: [process.env.FGLAB_URL, process.env.FGLABPUBLIC_URL]}
}

/* Routes */
// Updates projects.json with new project ID

app.options("/projects", cors(cors_config)); // Enable pre-flight request for PUT
app.put("/projects", jsonParser, cors(cors_config), (req, res) => {
  var id = req.body.project_id;
  var command = req.body.command;
  var args = req.body.args;
  var options = req.body.options;
  var capacity = req.body.capacity;
  // Insert project implementation template if new
  if (!projects[id]) {
    projects[id] = {
      cwd: "/root/FGMachine/cloudml_optimisation/"+id,
      command: command,
      args: args,
      options: options,
      capacity: capacity,
      results: "/root/FGMachine/cloudml_optimisation/"+id
    };
    fs.writeFile("projects.json", JSON.stringify(projects, null, "\t"));
    res.send({msg: "Project ID " + id + " template added - please adjust on " + specs.hostname});
  } else {
    res.send({msg: "Project ID " + id + " already exists"});
  }
});

app.get("/test", (req, res) => {
  res.send({message: "Hello"});
});

// Checks capacity
app.get("/projects/:id/capacity", (req, res) => {
  var capacity = getCapacity(req.params.id);
  if (capacity === 0) {
    res.status(501).send({error: "No capacity available"});
  } else {
    res.send({capacity: capacity, address: specs.address, _id: specs._id});
  }
});

// receive file 
app.put("/projects/:id/extrafile/:runFlag", upload.single("_file"), (req, res) => {

  var proId = req.params.id;
  var runFlag = req.params.runFlag;
  var dir = "/root/FGMachine/cloudml_optimisation/"+proId+"/";

  //Check directory or create
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
  //get file name
  var filename = dir+req.file.originalname;
  //wirte to file
  fs.writeFile(filename, req.file.buffer, (err) => {
    if (err) throw err;
  });

  var message = "";

  if(runFlag=="1"){  
    var bash = spawn('bash', [filename]);
    bash.stdout.on('data', function (data) {    // register one or more handlers
      message = " Run  file successfully : " + process.env.FGMACHINE_URL;
      res.send(message);
      
      console.log('===========  stdout: ============' );
      console.log(data.toString());
    });
  }else{
    message = " Receive  file successfully : " + process.env.FGMACHINE_URL;
    res.send(message);
  }
  

});

// Starts experiment
app.post("/projects/:id", jsonParser, (req, res) => {
  // Check if capacity still available
  if (getCapacity(req.params.id) === 0) {
    return res.status(501).send({error: "No capacity available"});
  }

  // Process args
  var experimentId = req.body._id;
  var gpuRequired = isGPURequired(req.params.id);
  var assignedGPUId = 0;
  var project = projects[req.params.id];
  var args = [];
  for (var i = 0; i < project.args.length; i++) {
    args.push(project.args[i]);
  }
  var options = req.body;
  // Command-line parsing
  var functionParams = [];
  for (var prop in options) {
    if (project.options === "plain") {
      args.push(prop);
      args.push(options[prop]);
    } else if (project.options === "single-dash") {
      args.push("-" + prop);
      args.push(options[prop]);
    } else if (project.options === "double-dash") {
      args.push("--" + prop + "=" + options[prop]);
    } else if (project.options === "function") {
      functionParams.push(JSON.stringify(prop));
      functionParams.push(JSON.stringify(options[prop]));
    }
  }
  if (project.options === "function") {
    functionParams = functionParams.toString().replace(/\"/g, "'"); // Replace " with '
    args[args.length - 1] = args[args.length - 1] + "(" + functionParams  + ");";
  }


  // List of file promises (to make sure all files are uploaded before removing results folder)
  var filesP = [];
  // Results-sending function for JSON
  var sendJSONResults = function(results) {
    return rp({uri: process.env.FGLAB_URL + "/api/v1/experiments/" + experimentId, method: "PUT", json: JSON.parse(results), gzip: true});
  };
  // Results-sending function for other files
  var sendFileResults = function(filename) {
    // Create form data
    var formData = {_files: []};
    // Add file
    formData._files.push(fs.createReadStream(filename));
    return rp({uri: process.env.FGLAB_URL + "/api/v1/experiments/" + experimentId + "/files", method: "PUT", formData: formData, gzip: true});
  };

  // Watch experiments folder
  var watcher;
  var resultsDir = path.join(project.results, experimentId);
  var topLevelWatcher = chokidar.watch(project.results, {ignorePermissionErrors: true, ignoreInitial: true, depth: 1}).on("addDir", topLevelPath => {
    if (topLevelPath.indexOf(experimentId) > -1) {
      // Watch experiment folder
      watcher = chokidar.watch(resultsDir, {awaitWriteFinish: true}).on("all", (event, experimentPath) => {
        if (event === "add" || event === "change") {
           if (experimentPath.match(/\.json$/)) {
            // Process JSON files
            filesP.push(fs.readFile(experimentPath, "utf-8").then(sendJSONResults));
          } else {
            // Store filenames for other files
            filesP.push(sendFileResults(experimentPath));
          }     
        }
      });

      // Close experiments folder watcher
      topLevelWatcher.close();
    }
  });

  // Control GPU capacity
  if (gpuRequired) {
    var freeGPUId = 0;
    for (; freeGPUId < specs.gpus.length; freeGPUId++) {
      if (GPUsCapacity[freeGPUId] >= project.gpu_capacity) {
        break;
      }
    }
    GPUsCapacity[freeGPUId] = Math.max(GPUsCapacity[freeGPUId] - project.gpu_capacity, 0); // Reduce GPU capacity
    assignedGPUId = freeGPUId;

    // Setting up command
    args.push(project.gpu_command);
    args.push(freeGPUId);
  }
  
  // Spawn experiment
  var experiment = spawn(project.command, args, {cwd: project.cwd})
  // Catch spawning errors
  .on("error", () => {
    // Notify of failure
    rp({uri: process.env.FGLAB_URL + "/api/v1/experiments/" + experimentId, method: "PUT", json: {_status: "fail"}, gzip: true});
    // Log error
    console.log("Error: Experiment could not start - please check projects.json");
  });
  
  maxCapacity = Math.max(maxCapacity - project.capacity, 0); // Reduce capacity of machine
  rp({uri: process.env.FGLAB_URL + "/api/v1/experiments/" + experimentId + "/started", method: "PUT", data: null}); // Set started
  // Save experiment
  experiments[experimentId] = experiment;

  // Log stdout
  experiment.stdout.on("data", (data) => {
    mediator.emit("experiments:" + experimentId + ":stdout", data.toString()); // Emit event
  });
  // Log errors
  experiment.stderr.on("data", (data) => {
    mediator.emit("experiments:" + experimentId + ":stderr", data.toString()); // Emit event
    console.log("Error: " + data.toString());
  });

  // Processes results
  experiment.on("exit", (exitCode) => {
    maxCapacity = Math.min(maxCapacity + project.capacity, 1); // Add back capacity
    if (gpuRequired) {
      GPUsCapacity[assignedGPUId] = Math.min(GPUsCapacity[assignedGPUId] + project.gpu_capacity, 1); 
    }

    // Send status
    var status = (exitCode === 0) ? "success" : "fail";
    rp({uri: process.env.FGLAB_URL + "/api/v1/experiments/" + experimentId, method: "PUT", json: {_status: status}, gzip: true});
    rp({uri: process.env.FGLAB_URL + "/api/v1/experiments/" + experimentId + "/finished", method: "PUT", data: null}); // Set finished

    // Finish watching for files after 10s
    setTimeout(() => {
      if (watcher) {
        // Close experiment folder watcher
        watcher.close();
       // Confirm upload and delete results folder to save space
        Promise.all(filesP).then(function() {
          rimraf(resultsDir, (err) => {
            if (err) {
              console.log(err);
            }
          });
        })
        .catch((err) => {
          console.log(err);
        });
      } else {
        // Close experiments folder watcher
        topLevelWatcher.close();
      }
    }, 10000);

    // Delete experiment
    delete experiments[experimentId];
  });
  res.send(req.body);
});

// Kills experiment
app.post("/experiments/:id/kill", (req, res) => {
  if (experiments[req.params.id]) {
    experiments[req.params.id].kill();
  }
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow CORS
  res.send(JSON.stringify({status: "killed"}));
});

// Resets capacity to 1
app.post("/capacity/reset", (req, res) => {
  maxCapacity = 1;
  for (var i = 0; i < specs.gpus.length; i++) {
    GPUsCapacity[i] = 1;
  }
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow CORS
  res.sendStatus(200);
});


/* HTTP Server */
var server = null;
if ( cfg.ssl ) {
  var server = httpServ.createServer(
    { key: fs.readFileSync( cfg.ssl_key ),cert: fs.readFileSync( cfg.ssl_cert ) },
    app); // Create HTTPS server
    console.log("CREATED HTTPS");
} else {
  console.log("CREATED HTTP");
  server = httpServ.createServer(app); // Create HTTP server
}

if (!process.env.FGMACHINE_URL) {
  console.log("Error: No FGMachine address specified");
  process.exit(1);
} else {
  // Listen for connections
  var port = url.parse(process.env.FGMACHINE_URL).port;
  server.listen(port, () => {
    console.log("Server listening on port " + port);
  });
}


/* WebSocket server */
// Add websocket server
var wss = new WebSocketServer({server: server});
// Catches errors to prevent FGMachine crashing if browser disconnect undetected
var wsErrHandler = function() {
  console.log("ERROR");
};

// Call on connection from new client
wss.on("connection", (ws) => {
  // Listeners
  var sendStdout = function(data) {
    ws.send(JSON.stringify({stdout: data}), wsErrHandler);
  };
  var sendStderr = function(data) {
    ws.send(JSON.stringify({stderr: data}), wsErrHandler);
  };

  // Check subscription for logs
  var expId;
  ws.on("message", (message) => {
    if (message.indexOf("experiments") === 0) {
      expId = message.split(":")[1];
      // Send stdout and stderr
      mediator.on("experiments:" + expId + ":stdout", sendStdout);
      mediator.on("experiments:" + expId + ":stderr", sendStderr);
    }
    console.log("Message: " + message)
  });

  // Remove listeners
  ws.on("close", () => {
    mediator.removeListener("experiments:" + expId + ":stdout", sendStdout);
    mediator.removeListener("experiments:" + expId + ":stdout", sendStderr);
  });
});
