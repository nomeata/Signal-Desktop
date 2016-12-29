(function () {
    'use strict';
    window.Whisper = window.Whisper || {};

    function ExportArchive(options) {
	var id = options.conversation;
	this.conversation = new Whisper.Conversation({id: id});
	this.conversation.fetch();
	this.conversation.fetchMessages();
	this.window = options.window;
    }

    ExportArchive.prototype = {
	export: function(onSuccess) {
          var archiver = this;

          archiver.window.chrome.fileSystem.chooseEntry( {
              type: 'saveFile',
              suggestedName: 'signal.zip',
                accepts: [ { description: 'Zip files (*.zip)',
                             extensions: ['zip']} ],
                acceptsAllTypes: true
              }, function (fileEntry) {
                var shadow_view = new Whisper.ConversationStaticView({
                    model: archiver.conversation,
                    window: archiver.window
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

                var conversation_source = export_doc[0].outerHTML;

                var mediablobs = archiver.conversation.messageCollection
                    .chain()
                    .map(function (message) {
                        return message.get('attachments').map(function (attachment,idx) {
                            var url = 'media/'+ message.id + '-' + idx;
                            return {
                                url: url,
                                blob: new Blob([attachment.data], {type: attachment.contentType})
                           };
                        });
                    })
                    .flatten()
                    .value();

                  zip.workerScriptsPath = '/components/zip.js/WebContent/';
                  zip.createWriter(new zip.FileWriter(fileEntry,"application/zip"), function(writer) {
                    writer.add("index.html", new zip.TextReader(conversation_source), function() {
                      chrome.runtime.getPackageDirectoryEntry(function (packageDir) {
                          packageDir.getFile('stylesheets/manifest.css',{},function (fileEntry) {
                              fileEntry.file(function (blob) {
                                  writer.add("stylesheets/manifest.css", new zip.BlobReader(blob), function() {
                                    writer.add(mediablobs[0].url, new zip.BlobReader(mediablobs[0].blob), function() {
                                      writer.close(function(file) {
                                        onSuccess();
                                      });
                                    });
                                  });
                              });
                          }, function (error) {console.warn(error);});
                      });
                    }, function(currentIndex, totalIndex) {
                      // onprogress callback
                    }, function(error) {
                      // onerror callback
                  });
              });
          });

	}
    };

    Whisper.ExportArchive = ExportArchive;
})();

