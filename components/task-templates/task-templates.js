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
      console.log('[task-templates] 选择模板:', e.detail);
      
      // 更详细的日志信息
      const template = e.detail.template || e.detail;
      console.log('[task-templates] 模板详情 - ID:', template.id, '名称:', template.title || template.name, '类型:', template.taskType);
      
      // 触发事件时提供完整的模板信息
      this.triggerEvent('templateSelect', { template });
    },

    /**
     * 处理自定义选择事件
     */
    onCustomSelect(e) {
      console.log('[task-templates] 选择自定义模板:', e.detail);
      const { type } = e.detail;
      
      // 添加选择类型的详细日志
      console.log('[task-templates] 自定义任务类型:', type);
      
      this.triggerEvent('customSelect', { type });
    },

    /**
     * 处理编辑简称事件
     */
    onEditShortName(e) {
      console.log('[task-templates] 编辑模板简称:', e.detail);
      
      // 添加详细日志
      const { id, value, type } = e.detail;
      console.log('[task-templates] 编辑简称详情 - ID:', id, '新值:', value, '类型:', type);
      
      this.triggerEvent('editShortName', e.detail);
    },

    /**
     * 处理删除模板事件
     */
    onDeleteTemplate(e) {
      console.log('[task-templates] 删除模板:', e.detail);
      
      // 添加详细日志
      const { templateId, type } = e.detail;
      console.log('[task-templates] 删除模板详情 - ID:', templateId, '类型:', type);
      
      // 确认是否要删除模板
      wx.showModal({
        title: '确认删除',
        content: '确定要删除该常用任务吗？',
        success: (res) => {
          if (res.confirm) {
            console.log('[task-templates] 用户确认删除模板');
            this.triggerEvent('deleteTemplate', e.detail);
          } else {
            console.log('[task-templates] 用户取消删除模板');
          }
        }
      });
    }
  }
}) 