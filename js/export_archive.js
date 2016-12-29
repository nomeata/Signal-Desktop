(function () {
    'use strict';
    window.Whisper = window.Whisper || {};

    function ExportArchive(options) {
        var id = options.conversation;
        this.conversation = new Whisper.Conversation({id: id});
        this.conversation.fetch();
        this.window = options.window;
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
            this.window.chrome.fileSystem.chooseEntry( {
                type: 'saveFile',
                suggestedName: 'signal.zip',
                  accepts: [ { description: 'Zip files (*.zip)',
                               extensions: ['zip']} ],
                  acceptsAllTypes: true
                }, resolve);
        }.bind(this));},

        start_export: function (fileEntry) {return new Promise(function(resolve,reject){
            zip.workerScriptsPath = '/components/zip.js/WebContent/';
            zip.createWriter(new zip.FileWriter(fileEntry,"application/zip"), function(writer) {
              this.writer = writer;
              resolve();
            }.bind(this),
            function(currentIndex, totalIndex) {
              // onprogress callback
            }.bind(this),
            reject);
        }.bind(this));},

        add_static_files: function() {return new Promise(function(resolve,reject){
          chrome.runtime.getPackageDirectoryEntry(function (packageDir) {
            packageDir.getFile(
              'stylesheets/manifest.css',
              {},
              function (fileEntry) {
                fileEntry.file(function (blob) {
                  this.writer.add(
                    "stylesheets/manifest.css",
                    new zip.BlobReader(blob),
                    resolve);
                }.bind(this));
              }.bind(this),
              reject
            );
          }.bind(this));
        }.bind(this));},

        fetch_messages: function() {
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

          return  export_doc[0].outerHTML;
        },

        add_messages: function() {return new Promise(function(resolve,reject){
          this.writer.add("index.html", new zip.TextReader(this.conversation_source()), resolve);
        }.bind(this));},

        add_all_media: function() {return new Promise(function(resolve,reject){
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
          var blob = new Blob([options.data], {type: options.contentType});
          this.writer.add(
            options.url,
            new zip.BlobReader(blob),
            resolve,
            null, //progress
            { level: 0,
              lastModDate: new Date(options.timestamp)
            });
        },

        done: function() {return new Promise(function(resolve,reject){
          this.writer.close(resolve);
        }.bind(this));},
    };

    Whisper.ExportArchive = ExportArchive;
})();

