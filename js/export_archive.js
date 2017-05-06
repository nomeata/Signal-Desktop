(function () {
    'use strict';
    window.Whisper = window.Whisper || {};

    // Interface to write files to a zip file, using zip.js
    // Seems to have trouble beyond 100MB
    function ZipArchiveWriter() {
	this.fileEntry = null;
	this.writer = null;
    }

    ZipArchiveWriter.prototype = {
	pickFilename: function (window, callback) {
            window.chrome.fileSystem.chooseEntry( {
                type: 'saveFile',
                suggestedName: 'signal.zip',
                accepts: [ { description: 'Zip files (*.zip)',
                               extensions: ['zip']} ],
                acceptsAllTypes: true
                }, function(fileEntry) {
		    this.fileEntry = fileEntry;
		    callback();
		}.bind(this));
	},

	init: function (callback) {
            zip.workerScriptsPath = '/components/zip.js/WebContent/';
            zip.createWriter(new zip.FileWriter(this.fileEntry,"application/zip"), function(writer) {
              this.writer = writer;
              callback();
            }.bind(this),
            function(currentIndex, totalIndex) {
              // onprogress callback
            }.bind(this),
            function(err){
		console.log('zip.js reports error:', err);
	    }.bind(this));
	},

	add_blob: function (filename, blob, timestamp, callback) {
	    timestamp = timestamp || new Date();
	    console.log("blob size:", blob.size);
	    console.log("zip.BlobReader...");
	    var fileReader = new zip.BlobReader(blob);
	    console.log("writing...");
	    this.writer.add(
		filename,
		fileReader,
		callback,
		null, //progress
		{ level: 0, lastModDate: timestamp }
	    );
	},

	add_text: function (filename, text, callback) {
	    this.writer.add(filename, new zip.TextReader(text), callback);
	},

	done: function(callback) {
          this.writer.close(callback);
	}

    };

    // Interface to write files to a directory
    function FileArchiveWriter() {
	this.dirEntry = null;
    }

    FileArchiveWriter.prototype = {
	pickFilename: function (window, callback) {
	    console.log("FileArchiveWriter.pickFilename");
	    // Need permissions here
            window.chrome.fileSystem.chooseEntry( {
                type: 'openDirectory',
                // suggestedName: 'signal',
                }, function(fileEntry) {
		    if (fileEntry) {
			this.dirEntry = fileEntry;
			callback();
		    } else {
		        console.log("Could not open directory chooser");
		    }
		}.bind(this));
	    /* Cannot write there, it seems
	    chrome.runtime.getPackageDirectoryEntry(function (packageDir) {
		console.log("packageDir", packageDir);
		packageDir.getDirectory("archive",{create: true},
		    function(dirEntry) {
			this.dirEntry = dirEntry;
			callback();
		    }.bind(this),
		    function(error) {
			console.log("getDirectory failed", error);
		    }.bind(this));
	    }.bind(this));
	    */
	},

	init: function (callback) {
            callback();
	},

	openSubdirOf: function (dir, filename, callback) {
	    var match = filename.match(/([^\/]*)\/(.*)/);
	    if (match) {
		var dirName = match[1];
		var rest = match[2];
		dir.getDirectory(dirName, {create:true}, function(dirEntry) {
		    this.openSubdirOf(dirEntry, rest, callback);
		}.bind(this));
	    } else {
		callback(dir, filename);
	    }
	},

	add_blob: function (filename, blob, timestamp, callback) {
	    this.openSubdirOf(this.dirEntry, filename, function (dir,basename) {
		// Timestamps unsupported
		// timestamp = timestamp || new Date();
		var fileReader = new zip.BlobReader(blob);
		dir.getFile(
		    basename,
		    {create: true},
		    function(entry) {
			entry.createWriter(function(fileWriter) {
			    fileWriter.onwriteend = function(e) {
				console.log("Done writing");
				callback();
			    };
			    fileWriter.onerror = function(e) {
				console.log('Write failed: ', e);
			    };
			    //fileWriter.seek(0);
			    //fileWriter.truncate(0);
			    fileWriter.write(blob);
			}.bind(this));
		    }.bind(this),
		    function(error) {
			console.log("getFile failed", error.toString());
		    }
		);
	    }.bind(this));
	},

	add_text: function (filename, text, callback) {
	    var blob = new Blob([text], {type: 'text/html'});
	    this.add_blob(filename, blob, null, callback);
	},

	done: function(callback) {
	  callback();
	}

    };
    function ExportArchive(options) {
        var id = options.conversation;
        this.conversation = new Whisper.Conversation({id: id});
        this.conversation.fetch();
        this.window = options.window;
	// this.archive_writer = new ZipArchiveWriter();
	this.archive_writer = new FileArchiveWriter();
    }

    ExportArchive.prototype = {

        export: function(onSuccess, onError) {
          this.onError = onError;

          this.pickFilename()
            .then(this.start_export.bind(this))
            .then(this.add_static_files.bind(this))
            .then(this.fetch_messages.bind(this))
            .then(this.add_messages.bind(this))
            .then(this.add_all_media.bind(this))
            .then(this.done.bind(this))
            .then(onSuccess)
            .catch(onError);
        },

        pickFilename: function() {return new Promise(function(resolve){
	    console.log('pickFilename');
	    this.archive_writer.pickFilename(this.window, resolve);
        }.bind(this));},

        start_export: function () {return new Promise(function(resolve,reject){
	    console.log('start_export');
	    this.archive_writer.init(resolve);
        }.bind(this));},

        add_static_files: function() {return new Promise(function(resolve,reject){
	  console.log('add_static_files');
          chrome.runtime.getPackageDirectoryEntry(function (packageDir) {
            packageDir.getFile(
              'stylesheets/manifest.css',
              {},
              function (fileEntry) {
                fileEntry.file(function (blob) {
		    this.archive_writer.add_blob("stylesheets/manifest.css", blob, null, resolve);
                }.bind(this));
              }.bind(this),
              reject
            );
          }.bind(this));
        }.bind(this));},

        fetch_messages: function() {
	  console.log('fetch_messages');
          return this.conversation.fetchMessages(Number.MAX_SAFE_INTEGER);
        },

        conversation_source: function() {
          var shadow_view = new Whisper.ConversationStaticView({
              model: this.conversation,
              window: this.window
          });

          var export_doc = $('<html>')
              .append($('<head>')
                  .append($('<link href="stylesheets/manifest.css" rel="stylesheet" type="text/css"/>'))
                  .append($('<meta charset="utf-8"/>'))
                  .append($('<meta content="width=device-width, user-scalable=no, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0" name="viewport"/>'))
                  .append($('<meta name="viewport" content="width=device-width, initial-scale=1"/>'))
                  .append($('<title>Signal</title>')))
              .append($('<body>').toggleClass('android')
                  .append(shadow_view.el));

          shadow_view.render();

          return  export_doc[0].outerHTML.replace(/invalid:\/\//g,'');
        },

        add_messages: function() {return new Promise(function(resolve,reject){
	    console.log('add_messages');
	    this.archive_writer.add_text("index.html", this.conversation_source(), resolve);
        }.bind(this));},

        add_all_media: function() {return new Promise(function(resolve,reject){
	  console.log('add_all_media');
          return this.conversation.messageCollection
              .chain()
              .map(function (message) {
                  return message.get('attachments').map(function (attachment,idx) {
                      return this.add_media.bind(this,{
                        url: message.getStaticAttachmentUrl(attachment,idx),
                        data: attachment.data,
                        contentType: attachment.contentType,
                        timestamp: message.get('sent_at')});
                  }.bind(this));
              }.bind(this))
              .flatten()
              .reduceRight(_.wrap, resolve)
              .value()();
        }.bind(this));},

        add_media: function(options, resolve) {
	  var filename = options.url.replace(/invalid:\/\//g,'');
	  console.log('add_media', filename);
          var blob = new Blob([options.data], {type: options.contentType});
	  console.log('blob created');
	  var timestamp = new Date(options.timestamp);
	  this.archive_writer.add_blob(filename, blob, timestamp, resolve);
        },

        done: function() {return new Promise(function(resolve,reject){
	  console.log('done');
          this.archive_writer.done(resolve);
        }.bind(this));},
    };

    Whisper.ExportArchive = ExportArchive;
})();

