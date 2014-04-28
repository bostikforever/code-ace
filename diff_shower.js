/**
 * Implements inline showing of diffs
 * Makes use of Line Widgets
 * Inspired by https://github.com/ajaxorg/ace/blob/master/lib/ace/ext/error_marker.js
 */
ace.define('diffshower', ['require', 'exports', 'module', 'ace/line_widgets', 'ace/lib/dom', 'ace/range'], function(require, exports, module) {
    "use strict";
    var LineWidgets = require("ace/line_widgets").LineWidgets;
    var dom = require("ace/lib/dom");
    var Range = require("ace/range").Range;

    exports.DiffShower = function(editor, options) {
        var self = {}
        self.options = options;
        self.editor = editor;
        self.session = self.editor.ace.session;
        if (!self.session.widgetManager) {
            self.session.widgetManager = new LineWidgets(self.session);
            self.session.widgetManager.attach(self.editor.ace);
        }
        self.enable = function(bool) {
            if (bool) {
                self.editor.ace.on('change', self.onDocumentChange);
                self.editor.ace.on('changeSelection', self.onSelectionChange);
            } else {
                self.editor.ace.off('change', self.onDocumentChange);
                self.editor.ace.off('changeSelection', self.onSelectionChange);
            }
        }
        self.markers = [];
        self.onDocumentChange = function() {
            self.diff = self._calculateDiff();
            //remove previous markers
            if (self.markers.length) {
                $.each(self.markers, function(idx, val) {
                    self.editor.ace.session.removeMarker(val);
                })
            }
            //add new markers
            var diff_keys = Object.keys(self.diff);
            if (diff_keys.length) {
                //decorate appropraite lines as green and red
                $.each(diff_keys, function(idx, line) {
                    var lineEnd = self.editor.ace.session.getLine(line).length;
                    self.markers.push(self.editor.ace.session.addMarker(new Range(line, 0, line, lineEnd), "hightlight-green", "fullLine"));
                });
            }
            //this is where we would handle highlighting as we did in "showDiffs" i.e. if we are to handle it
        }
        self.onSelectionChange = function() {
            if (self.editor.ace.getSession().getSelection().isMultiLine() || !self.diff)
                return;
            var pos = self.editor.ace.getCursorPosition();
            var currentRow = pos.row;
            if (currentRow in self.diff) {
                var oldWidget = self.session.lineWidgets && self.session.lineWidgets[currentRow];
                if (oldWidget) {
                    oldWidget.destroy(true);
                }
                var widget = self._buildWidget(pos);
                if (widget) {
                    self.editor.ace.session.widgetManager.addLineWidget(widget);
                }
            }
        }
        self._buildWidget = function(position) {
            //make some assertions
            var row = position.row
            var w = null;
            var className = self.options && self.options.className;
            if (self.template_lines && self.template_lines.length > row) {
                w = {
                    row: row,
                    fixedWidth: true,
                    coverGutter: true,
                    el: dom.createElement("div")
                };

                var el = w.el.appendChild(dom.createElement("div"));
                var arrow = w.el.appendChild(dom.createElement("div"));
                if (className) {
                    arrow.className = "error_widget_arrow " + className;
                } else {
                    arrow.className = "error_widget_arrow ace_error";
                }
                var left = self.editor.ace.renderer.$cursorLayer.getPixelPosition(position).left;
                arrow.style.left = left + self.editor.ace.renderer.gutterWidth - 5 + "px";

                w.el.className = "error_widget_wrapper";
                if (className) {
                    el.className = "error_widget " + className;
                } else {
                    el.className = "error_widget ace_error";
                }
                var diffLine = self.template_lines[row];
                var lineWidth = self.editor.ace.session.getScreenWidth()
                el.innerHTML = diffLine.match(new RegExp('.{1,'+lineWidth+'}', 'g')).join("<br>");
                el.style.paddingLeft = self.editor.ace.renderer.gutterWidth + self.editor.ace.renderer.$padding + "px";

                //widget should self distruct if selection/session changes
                w.destroy = function(ingoreMouse) {
                    if (self.editor.ace.$mouseHandler.isMousePressed && !ingoreMouse)
                         return;
                    self.session.widgetManager.removeLineWidget(w);
                    self.editor.ace.off("changeSelection", w.destroyOnExit);
                    self.editor.ace.off("mouseup", w.destroyOnExit);
                    self.editor.ace.off("changeSession", w.destroy);
                    self.editor.ace.off("change", w.destroy);
                };
                w.destroyOnExit = function() {
                    var pos = self.editor.ace.getCursorPosition();
                    var currentRow = pos.row;
                    if (w.row != currentRow) {
                        w.destroy();
                    }
                }
                self.editor.ace.on("mouseup", w.destroyOnExit);
                self.editor.ace.on("changeSelection", w.destroyOnExit);
                self.editor.ace.on("changeSession", w.destroy);
                self.editor.ace.on("change", w.destroy);
            }
            return w;
        }
        self._calculateDiff = function() {
            /**
             * returns a list of lines that differ between the template and the original document
             * makes use of codility's diff library (diff.js)
             * as a side effect, cache current version of template and template_lines
             *
             */
            var diff = {};
            var template = self.editor.template;
            var value = self.editor.getValue();
            if (template) {
                var template_lines = Diff.splitLines(template);
                var value_lines = Diff.splitLines(value);
                var linesLength = Math.max(template_lines.length, value_lines.length);
                for (var i = 0; i < linesLength; i++) {
                    if (template_lines[i] !== value_lines[i]) {
                        diff[i] = true;
                    }
                }
                //compare with previous template, update array of template strings
                if (template !== self.template) {
                    self.template = template;
                    self.template_lines = template_lines;
                }
            }
            return diff;
        }
        return self;
    }

    dom.importCssString("\
        .error_widget_wrapper {\
            background: inherit;\
            color: inherit;\
            border:none\
        }\
        .error_widget {\
            border-top: solid 2px;\
            border-bottom: solid 2px;\
            margin: 5px 0;\
            padding: 1px 0px 1px 50px;\
            white-space: pre-wrap;\
        }\
        .error_widget.ace_error, .error_widget_arrow.ace_error{\
            border-color: #ff5a5a\
        }\
        .error_widget.ace_warning, .error_widget_arrow.ace_warning{\
            border-color: #F1D817\
        }\
        .error_widget.ace_info, .error_widget_arrow.ace_info{\
            border-color: #5a5a5a\
        }\
        .error_widget.ace_ok, .error_widget_arrow.ace_ok{\
            border-color: #5aaa5a\
        }\
        .error_widget_arrow {\
            position: absolute;\
            border: solid 5px;\
            border-top-color: transparent!important;\
            border-right-color: transparent!important;\
            border-left-color: transparent!important;\
            top: -5px;\
        }\
        ", "");

});