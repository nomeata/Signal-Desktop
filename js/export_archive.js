(function () {
    'use strict';
    window.Whisper = window.Whisper || {};

    function ExportArchive(options) {
        var id = options.conversation;
        this.conversation = new Whisper.Conversation({id: id});
        this.conversation.fetch();
        this.conversation.fetchMessages(Number.MAX_SAFE_INTEGER);
        this.window = options.window;
    }

    ExportArchive.prototype = {

        export: function(onSuccess, onError) {
          this.onSuccess = onSuccess;
          this.onError = onError;
          this.pickFilename();
        },

        pickFilename: function() {
          this.window.chrome.fileSystem.chooseEntry( {
              type: 'saveFile',
              suggestedName: 'signal.zip',
                accepts: [ { description: 'Zip files (*.zip)',
                             extensions: ['zip']} ],
                acceptsAllTypes: true
              }, this.start_export.bind(this));
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

        start_export: function (fileEntry) {
          zip.workerScriptsPath = '/components/zip.js/WebContent/';
          zip.createWriter(new zip.FileWriter(fileEntry,"application/zip"), function(writer) {
            this.writer = writer;
            this.addStaticFiles();
          }.bind(this),
          function(currentIndex, totalIndex) {
            // onprogress callback
          }.bind(this),
          self.onError);
        },

        addStaticFiles: function() {
          chrome.runtime.getPackageDirectoryEntry(function (packageDir) {
            packageDir.getFile('stylesheets/manifest.css',{},function (fileEntry) {
             fileEntry.file(function (blob) {
                this.writer.add("stylesheets/manifest.css", new zip.BlobReader(blob), function() {
                  this.addMessages();
                }.bind(this));
              }.bind(this));
            }.bind(this),
            function (error) {
              console.warn(error);
            }.bind(this));
          }.bind(this));
        },

        addMessages: function() {
          this.writer.add("index.html", new zip.TextReader(this.conversation_source()), function() {
            this.addAllMedia();
          }.bind(this));
        },

        addAllMedia: function() {
          var addMedia_actions = this.conversation.messageCollection
              .chain()
              .map(function (message) {
                  return message.get('attachments').map(function (attachment,idx) {
                      return this.addMedia.bind(this,{
                        url: message.getStaticAttachmentUrl(attachment,idx),
                        data: attachment.data,
                        contentType: attachment.contentType,
                        timestamp: message.get('sent_at')});
                  }.bind(this));
              }.bind(this))
              .flatten()
              .value();

            _(addMedia_actions).reduceRight(_.wrap, this.done.bind(this))();
        },

        done: function () {
          this.writer.close(function(file) {
            this.onSuccess();
          }.bind(this));
        },

        addMedia: function(options, cb) {
          var blob = new Blob([options.data], {type: options.contentType});

          this.writer.add(
            options.url,
            new zip.BlobReader(blob),
            cb,
            self.onError,
            { level: 0,
              lastModDate: new Date(options.timestamp)
            });
        },
    };

    Whisper.ExportArchive = ExportArchive;
})();

