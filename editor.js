/* global Log, Diff */
/* global CodeMirror */
/* global ace */


/*mock Log object */
doNothing = function() {};
var Log = {
    error: doNothing,
    debug: doNothing
};

function Editor() {
    var self = {
        template: null
    };

    self._updateTaskHeight = function(h) {
        $('#task_description').css({
            'height': h + 'px'
        });
    };

    self._updateEditorHeight = function(h) {
        $('#solution').css({
            minHeight: h - 15
        });
        $('#solution').css({
            height: h - 15
        });
    };

    self.updatePageLayout = function() {
        var wh = $(window).height();

        var hdr_h = $('#header').height();
        var console_h = $('#console').height();
        var buttons_h = $('#buttons').height();
        var ver_h = $('#verification_results').height();
        var eb_h = $('#editor_bar').height();

        var editor_h = Math.max(250, wh - hdr_h - console_h - buttons_h - 70 - eb_h);
        var task_h = Math.max(200, wh - hdr_h - ver_h - 50);
        self._updateEditorHeight(editor_h);
        self._updateTaskHeight(task_h);

        Log.debug("candidate update page", "editor_h=" + editor_h + " wh=" + wh + " hdr_h=" +
            hdr_h + " console_h=" + console_h + " buttons_h=" + buttons_h + ' ver_h=' + ver_h);
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

    self.setPrgLang = function(prg_lang) {};

    self.setEditable = function(editable) {};

    self.clearHistory = function() {};

    self.onCopyEvent = function(f) {};
    self.onPasteEvent = function(f) {};
    self.onChangeEvent = function(f) {
        $('#solution').on('change', f);
    };

    return self;
}

function AceEditor() {
    var self = Editor();
    try {
        $('#solution').after('<pre class="ace" style="display: none;"></pre>');
        self.ace = ace.edit($('.ace').get(0));
        $('#solution').hide();
        $('.ace').show();

    } catch (err) {
        Log.error("Candidate interface", "Error setting up Ace", err);
        window.alert(err);
        // Fall back to normal textarea-based Editor
        return self;
    }
    self.diffshower = ace.require('diffshower').DiffShower(self);
    self.diffshower.enable(true);
    self.Range = ace.require('ace/range').Range;
    self.Anchor = ace.require('ace/anchor').Anchor;
    self.HashHandler = ace.require("ace/keyboard/hash_handler").HashHandler
    var session = self.ace.getSession();
    session.setTabSize(4);
    session.setUseSoftTabs(true);
    session.setUseWrapMode(true);

    self._updateEditorHeight = function(h) {
        $('.ace').css({
            minHeight: h
        });
        $('.ace').css({
            height: h
        });
        self.ace.resize();
    };

    self.clean = function() {
        self.ace.replaceAll('-', {
            needle: '\u2212'
        }); // convert unicode minus to hyphen-minus (#1668)
    };

    self.getValue = function() {
        self.clean();
        return self.ace.getValue();
    };

    self.setValue = function(value) {
        if(self.readOnlyRanges){
            //detach document
            $.each(self.readOnlyRanges, function(idx, value){
                value.start.detach();
                value.end.detach();
            });
        }
        self.ace.getSession().setValue(value);
        self.ace.clearSelection();
        //self.highlightDiff();
        //self.showDiff();
        if (self.handleChange)
            self.handleChange();
        if(self.readOnlyRanges){
            //atach document
            doc = self.ace.getSession().getDocument();
            $.each(self.readOnlyRanges, function(idx, value){
                value.start.attach(doc);
                value.end.attach(doc);
            });
        }
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
        var mode = 'ace/mode/' + self.prgLangToEditorMode(prg_lang);
        if (prg_lang == 'php') // Highlight PHP without <?php tag
            self.ace.getSession().setMode({
                path: mode,
                inline: true
            });
        else
            self.ace.getSession().setMode({
                path: mode
            });
    };

    self.setEditable = function(editable) {
        self.ace.setReadOnly(!editable);
    };

    self.clearHistory = function() {
        self.ace.getSession().setUndoManager(new ace.UndoManager());
    };

    self.onCopyEvent = function(f) {
        self.ace.on('copy', f);
    };
    self.onPasteEvent = function(f) {
        self.ace.on('paste', f);
    };
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
    self.markers = [];
    self.readOnlyRanges = [];
    self.noNewLines = false;
    self.setReadOnlyRegions = function(regions) {
        //regions is a list of ranges
        //if only the start position is specified, the range terminates at end-of-line
        //this makes the assumpiton that the line is not empty
        $.each(regions, function(index, value) {
            if (value.start) {
                var start = value.start
                var end = {}
                if (!value.end) {
                    end['row'] = start['row'];
                    end['column'] = self.ace.getSession().getDocument().getLine(start['row']).length;
                } else {
                    end = value.end
                }
                doc = self.ace.getSession().getDocument();
                start_anchor = new self.Anchor(doc, start.row, start.column);
                start_anchor.setPosition(start.row, start.column, true)
                end_anchor = new self.Anchor(doc, end.row, end.column);
                end_anchor.setPosition(end.row, end.column, true)
                self.readOnlyRanges.push({"start": start_anchor, "end": end_anchor});
            }
        });
    }
    self.setNoNewLines = function(bool){
        self.noNewLines = Boolean(bool);
        if (self.noNewLines){
            self.ace.keyBinding.addKeyboardHandler(self.keyHandlers.enterHandler)
        }
        else{
            self.ace.keyBinding.removeKeyboardHandler(self.keyHandlers.enterHandler)
        }
    };
    self.keyHandlers = {
        enterHandler : new self.HashHandler([{// to assign a name to return key
            name: "return",
            bindKey: "Return|Shift-Return",
            descr: "Always block Return",
            exec: function(ed){
                return false;

            }
        }])
    };
    self.enforceReadOnlyRegions = function(e) {
        //check that ranges have been sent
        var editor = e.editor;
        var command = e.command;
        var contains = false;
        var multiLineSelect = false;
        if (self.readOnlyRanges) {
            $.each(self.readOnlyRanges, function(index, val){
                contains = self.inRange(val);
                if (contains){
                    return false;
                }
            });
        }
        if (self.noNewLines){
            multiLineSelect = self.ace.getSession().getSelection().isMultiLine();
        }
        if (contains || multiLineSelect){
            if (!command.readOnly){//commad.readOnly is true if the command doesn't cause a write
                e.preventDefault();
                e.stopPropagation();
            }
        }
        else if(self.noNewLines){
            var currentCursor = self.ace.getCursorPosition();
            var rightEdge = currentCursor.column == self.ace.getSession().getLine(currentCursor.row).length;
            var leftEdge = currentCursor.column == 0;
            var stop = self.isPrevented(command)||self.isReturn(command) || (self.isDelete(command) && rightEdge) || (self.isBackspace(command) && leftEdge);
            if (stop){
                //console.log(command);
                e.preventDefault();
                e.stopPropagation();
            }
        }
    };
    self.inRange = function(range){ //check if the current range intersects with selection
        sel = self.ace.getSession().getSelection().getRange();
        start = range["start"];
        end = range["end"];
        range = new self.Range(start.row, start.column, end.row, end.column);
        return range.intersects(sel);
    };
    self.isDelete = function(command){
        return command.name in {"del" : true, "removetolineend" : true, "removewordright": true};
    };
    self.isBackspace = function(command){
        return command.name in {"backspace":true,  "cut-or-delete":true, "removetolinestart":true, "removewordleft": true};
    };
    self.isReturn = function(command){
        return command.name in {"return": true}
    };
    self.isPrevented = function(command){
        return command.name in {"cut":true,
                                "removeline":true,
                                "duplicateSelection":true,
                                "copylinesup":true,
                                "copylinesdown": true,
                                "movelinesup": true,
                                "movelinesdown" : true,
                                "splitline" : true}
    };
    //self.ace.on('change', self.highlightDiff);

    self.ace.commands.on("exec", self.enforceReadOnlyRegions);
    return self;
}