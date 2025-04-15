Component({
  /**
   * 组件的属性列表
   */
  properties: {
    studyTemplates: {
      type: Array,
      value: []
    },
    habitTemplates: {
      type: Array,
      value: []
    },
    selectedTemplate: {
      type: String,
      value: ''
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 处理模板选择事件
     */
    onTemplateSelect(e) {
      console.log('选择模板:', e.detail);
      this.triggerEvent('templateSelect', e.detail);
    },

    /**
     * 处理自定义选择事件
     */
    onCustomSelect(e) {
      console.log('选择自定义模板:', e.detail);
      this.triggerEvent('customSelect', e.detail);
    },

    /**
     * 处理编辑简称事件
     */
    onEditShortName(e) {
      console.log('编辑模板简称:', e.detail);
      this.triggerEvent('editShortName', e.detail);
    },

    /**
     * 处理删除模板事件
     */
    onDeleteTemplate(e) {
      console.log('删除模板:', e.detail);
      this.triggerEvent('deleteTemplate', e.detail);
    }
  }
}) 