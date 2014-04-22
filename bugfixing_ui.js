function bugFixingUI(options){
    self.options = options;
    self.getOption = function(option){
        if (typeof self.options !== "undefined"){
            if (option in self.options){
                return self.options[option]
            }
        }
        return null
    }
    self.updateModified = function(){
        //console.log("changeEvent fired");
        //self.editor.ace.undo();
    }

    self.onKeyPress = function(){

    };
    self.setupEditor = function() {
        self.editor = AceEditor();
        self.editor.onChangeEvent(self.updateModified);
        readOnlyRegions = self.getOption("readOnlyRegions");
        if (readOnlyRegions){
            self.editor.setReadOnlyRegions(readOnlyRegions);
        }
        self.editor.setNoNewLines(true);
    };

    self.init = function(){
        self.setupEditor();
    };
    self.onKeyPress = function(){

    };

    return self;
}