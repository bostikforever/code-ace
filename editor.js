/* global Log, Diff */
/* global CodeMirror */
/* global ace */


/*mock Log object */
doNothing = function(){};
var Log = {
    error: doNothing,
    debug: doNothing
};

function Editor() {
    var self = {
        template: null
    };

    self._updateTaskHeight = function(h) {
        $('#task_description').css({'height': h+'px'});
    };

    self._updateEditorHeight = function(h) {
        $('#solution').css({minHeight: h-15});
        $('#solution').css({height: h-15});
    };

    self.updatePageLayout = function() {
        var wh = $(window).height();

        var hdr_h = $('#header').height();
        var console_h = $('#console').height();
        var buttons_h = $('#buttons').height();
        var ver_h = $('#verification_results').height();
        var eb_h = $('#editor_bar').height();

        var editor_h = Math.max(250,wh-hdr_h-console_h-buttons_h-70-eb_h);
        var task_h = Math.max(200,wh-hdr_h-ver_h-50);
        self._updateEditorHeight(editor_h);
        self._updateTaskHeight(task_h);

        Log.debug("candidate update page" ,"editor_h="+editor_h+" wh="+wh+" hdr_h="+
                 hdr_h+" console_h="+console_h+" buttons_h="+buttons_h+' ver_h='+ver_h);
    };

    self.getValue = function() {
        return $('#solution').val();
    };

    self.setValue = function(value) {
        $('#solution').val(value);
    };

    self.setTemplate = function(template) {
        self.template = template;
    };

    self.setPrgLang = function(prg_lang) { };

    self.setEditable = function(editable) { };

    self.clearHistory = function () { };

    self.onCopyEvent = function(f) { };
    self.onPasteEvent = function(f) { };
    self.onChangeEvent = function(f) {
        $('#solution').on('change', f);
    };

    return self;
}

function AceEditor() {
    var self = Editor();

    try {
        $('#solution').after('<pre class="ace" style="display: none;"></pre>');
        $('#solution').after('<pre class="ace-diff" style="display: none;"></pre>');
        self.ace = ace.edit($('.ace').get(0));
        self.diffAce = ace.edit($('.ace-diff').get(0))
        $('#solution').hide();
        //$('.ace-diff').show();
        $('.ace').show();
        self.diffAce.setReadOnly(true);

    } catch(err) {
        Log.error("Candidate interface", "Error setting up Ace", err);
        window.alert(err);
        // Fall back to normal textarea-based Editor
        return self;
    }
    self.Range = ace.require('ace/range').Range;
    var session = self.ace.getSession();
    session.setTabSize(4);
    session.setUseSoftTabs(true);
    session.setUseWrapMode(true);

    self._updateEditorHeight = function(h) {
        $('.ace').css({minHeight: h});
        $('.ace').css({height: h});
        self.ace.resize();
    };

    self.clean = function() {
        self.ace.replaceAll('-', {needle:'\u2212'});  // convert unicode minus to hyphen-minus (#1668)
    };

    self.getValue = function() {
        self.clean();
        return self.ace.getValue();
    };

    self.setValue = function(value) {
        self.ace.getSession().setValue(value);
        self.ace.clearSelection();
        //self.highlightDiff();
        self.showDiff();
        if (self.handleChange)
            self.handleChange();
    };

    self.prgLangToEditorMode = function(prg_lang) {
        var lang_dict = {
            'c': 'c_cpp',
            'cpp': 'c_cpp',
            'cs': 'csharp',
            'java': 'java',
            'js': 'javascript',
            'lua': 'lua',
            'm': 'objectivec',
            'py': 'python',
            'pas': 'pascal',
            'php': 'php',
            'pl': 'perl',
            'rb': 'ruby',
            'scala': 'scala',
            'sql': 'sql',
            'vb': 'vbscript'
        };
        return lang_dict[prg_lang] || 'plain_text';
    };

    self.setPrgLang = function(prg_lang) {
        var mode = 'ace/mode/'+self.prgLangToEditorMode(prg_lang);
        if (prg_lang == 'php') // Highlight PHP without <?php tag
            self.ace.getSession().setMode({path: mode, inline: true});
        else
            self.ace.getSession().setMode({path: mode});
    };

    self.setEditable = function(editable) {
        self.ace.setReadOnly(!editable);
    };

    self.clearHistory = function() {
        self.ace.getSession().setUndoManager(new ace.UndoManager());
    };

    self.onCopyEvent = function(f) { self.ace.on('copy',f); };
    self.onPasteEvent = function(f) { self.ace.on('paste',f); };
    self.onChangeEvent = function(f) {
        self.handleChange = f;
        self.ace.on('change', f);
    };

    self.diff = null;

    self.highlightDiff = function() {
        if (self.diff) {
            $(self.diff.highlightChanged).each(function(i, line_no) {
                self.ace.getSession().removeGutterDecoration(line_no, 'diff-changed');
            });
            $(self.diff.highlightRemoved).each(function(i, line_no) {
                self.ace.getSession().removeGutterDecoration(line_no, 'diff-removed');
            });
        }

        if (self.template === null)
            self.diff = null;
        else {
            try {
                self.diff = Diff.analyze(self.template, self.getValue());
            } catch (err) {
                Log.error('Error computing diff', err);
                // fail gracefully
                self.diff = null;
                return;
            }
            $(self.diff.highlightChanged).each(function(i, line_no) {
                self.ace.getSession().addGutterDecoration(line_no, 'diff-changed');
            });
            $(self.diff.highlightRemoved).each(function(i, line_no) {
                self.ace.getSession().addGutterDecoration(line_no, 'diff-removed');
            });
        }
    };
    self.setReadOnlyLines = function(readOnlyLines){
        self.readOnlyLines = readOnlyLines;
        //unregister previous
        self.ace.getSession().getSelection().off('changeCursor', self.enforceReadOnly);
        self.ace.setReadOnly(false);
        if (self.readOnlyLines && self.readOnlyLines.length){
            self.ace.getSession().getSelection().on('changeCursor', self.enforceReadOnly);
            self.ace.getSession().getSelection()._emit('changeCursor');
        }
    }
    self.enforceReadOnly = function(){
        //options.readonly is an array of lines we can't edit
        var ses = self.ace.getSession();
        var sel = ses.getSelection();
        var lead = sel.getSelectionLead();
        var anchor = sel.getSelectionAnchor();
        var not_in = true;
        $.each(self.readOnlyLines, function(idx, line){
            range = self.ace.getSession().getSelection().getRange();
            in_range = range.start.row <= line && range.end.row >= line;
            if (in_range){
                not_in = false;
                return false;
            }
        })
        //there can be conflict if setReadOnly is called externally
        if (not_in){
            self.ace.setReadOnly(false);
        }
        else{
            self.ace.setReadOnly(true); //we are in readonly area
            //probably notify the user too, like change highlight or something
        }
    }
    self.initializeKeyHandlers = function(){
        //a list of function keys can be found here https://github.com/ajaxorg/ace/blob/master/lib/ace/lib/keys.js
        //we want to listen on "Backspace" and "Return"
        //also Shift+BackSpace, Ctrl+Backspace, Ctrl+Delete, Shift+Enter
        function bindKey(win, mac) {
            return {win: win, mac: mac};
        }
        HashHandler = ace.require("ace/keyboard/hash_handler").HashHandler
        //we block backspace at line beginning
        //we blook delete at line ending
        //we block return everytime
        self.keyhandlers = {
            backspaceHandler : new HashHandler([{
                bindKey: bindKey(
                    "Shift-Backspace|Backspace|Shift-Delete|Alt-Backspace|Ctrl-Backspace",
                    "Ctrl-Backspace|Shift-Backspace|Backspace|Command-Backspace|Alt-Backspace|Ctrl-Alt-Backspace"
                ),
                descr: "Block Backspace at beginning of a line",
                exec: function(ed){
                    var currentCursor = self.ace.getCursorPosition();
                    var blockBackspace = currentCursor.column == 0;
                    if (!blockBackspace)
                        return false; // allow other ace commands to handle event
                }
            }]),
            deleteHandler : new HashHandler([{
                bindKey: bindKey("Delete|Ctrl-Delete|Alt-Delete", "Delete|Ctrl-D|Shift-Delete|Ctrl-H|Alt-Delete|Ctrl-K"),
                descr: "Block Delete at the end of a line",
                exec: function(ed){
                    var currentCursor = self.ace.getCursorPosition();
                    var blockDelete = currentCursor.column == self.ace.getSession().getLine(currentCursor.row).length;
                    if (!blockDelete)
                        return false; // allow other ace commands to handle event
                }
            }]),
            enterHandler: new HashHandler([{
                bindKey: "Return|Shift-Return",
                descr: "Always block Return",
                exec: function(ed){
                }
            }])
        }
    }
    self.noEditOnMultiLineSelect = function(){
        selection = self.ace.getSession().getSelection();
        if (selection.isMultiLine()){
            self.ace.setReadOnly(true);
        }//we don't unset because enforce readonly lines does that already
    }
    self.enforceNoNewLinesKeyboardHandler = function(){
        self.ace.getSession().getSelection().off('changeCursor', self.noEditOnMultiLineSelect);
        if (!self.keyhandlers){
            self.initializeKeyHandlers();
        }
        //add our handlers
        self.ace.keyBinding.addKeyboardHandler(self.keyhandlers.backspaceHandler);
        self.ace.keyBinding.addKeyboardHandler(self.keyhandlers.deleteHandler);
        self.ace.keyBinding.addKeyboardHandler(self.keyhandlers.enterHandler);
        //remove commands that defeat ours
        //default commands list here https://github.com/ajaxorg/ace/blob/master/lib/ace/commands/default_commands.js
        self.ace.commands.removeCommands(["cut", /*should probably overwrite this one, not disablee*/
                                        "removeline",
                                        "duplicateSelection", /*should probably overwrite this one*/
                                        "copylinesup",
                                        "copylinesdown",
                                        "movelinesup",
                                        "movelinesdown",
                                        "splitline",
                                        ])
        self.ace.getSession().getSelection().on('changeCursor', self.noEditOnMultiLineSelect);
    }
    self.disableNoNewLinesKeyboardHandler = function(){
        //remove our handlers
        if (self.keyhandlers){
            self.ace.keyBinding.removeKeyboardHandler(self.keyhandlers.backspaceHandler);
            self.ace.keyBinding.removeKeyboardHandler(self.keyhandlers.deleteHandler);
            self.ace.keyBinding.removeKeyboardHandler(self.keyhandlers.enterHandler);
        }
        //add all the default handlers back
        self.ace.commands.addCommands(self.ace.commands.commands);
        self.ace.getSession().getSelection().off('changeCursor', self.noEditOnMultiLineSelect);
    }
    self.markers = []
    self.showDiff = function(){
        if (self.template){
           template_lines = Diff.splitLines(self.template)
           value_lines = Diff.splitLines(self.getValue())
           linesLength = Math.max(template_lines.length, value_lines.length)
            var i = 0
            diff = []
            for (;i<linesLength; i++){
                if(template_lines[i] !== value_lines[i]){
                    diff.push(i)
                }
            }
            //remove previous markers
            if (self.markers.length){
                $.each(self.markers, function(idx, val){
                    self.diffAce.session.removeMarker(val);
                    self.ace.session.removeMarker(val);
                })
            }
            //console.log(diff);
            if (diff.length){
                self.diffAce.setValue(self.template);
                self.diffAce.clearSelection();
                self.diffAce.scrollToLine(0);
                $('.ace-diff').show();
                //decorate appropraite lines as green and red
                $.each(diff, function(idx, line){
                    self.markers.push(self.diffAce.session.addMarker(new self.Range(line, 0, line, 1), "highlight-red", "fullLine"));
                    self.markers.push(self.ace.session.addMarker(new self.Range(line, 0, line, 1), "hightlight-green", "fullLine"));
                });
                self.diffAce.session.setScrollTop(self.ace.session.getScrollTop());
            }
            else{
                $('.ace-diff').hide();;
            }
        }
    }
    self.coupleScroll = function(scroll){
        //console.log(scroll)
        if(self.template){
            self.diffAce.session.setScrollTop(scroll);
        }
    }
    //self.ace.on('change', self.highlightDiff);
    self.ace.on('change', self.showDiff);
    self.ace.session.on("changeScrollTop", self.coupleScroll);

    return self;
}