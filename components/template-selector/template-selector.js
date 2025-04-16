Component({
  /**
   * 组件的属性列表
   */
  properties: {
    templates: {
      type: Array,
      value: []
    },
    selectedId: {
      type: String,
      value: ''
    },
    type: {
      type: String,
      value: 'study' // 默认学习类型
    },
    showCustom: {
      type: Boolean,
      value: true
    },
    maxDisplay: {
      type: Number,
      value: 7
    },
    customText: {
      type: String,
      value: '新增常用任务'
    },
    title: {
      type: String,
      value: '常用任务'
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    typeClass: 'study', // 默认使用学习样式
    showEditModal: false, // 是否显示编辑弹窗
    editingTemplate: {}   // 当前正在编辑的模板
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 选择模板
     */
    selectTemplate(e) {
      const templateId = e.currentTarget.dataset.id;
      const template = this.data.templates.find(t => t.id === templateId);
      
      if (template) {
        // 记录日志，优先使用title字段
        const templateName = template.title || template.name || '未命名模板';
        console.log('[template-selector] 模板选择 - ID:', templateId, '名称:', templateName, '类型:', this.data.type);
        
        // 触发选择事件，确保传递组件的type属性
        this.triggerEvent('select', {
          templateId: templateId,
          template: template,
          type: this.data.type // 显式添加type字段，确保类型信息一致传递
        });
        
        // 提供触感反馈
        wx.vibrateShort({
          type: 'light'
        });
      }
    },

    /**
     * 处理自定义选择事件
     */
    onCustomSelect(e) {
      console.log('[template-selector] 选择自定义模板:', e.detail);
      this.triggerEvent('customSelect', e.detail);
    },

    /**
     * 处理模板选择事件
     */
    onTemplateSelect(e) {
      console.log('[template-selector] 选择模板:', e.detail);
      this.triggerEvent('templateSelect', e.detail);
    },

    /**
     * 处理编辑简称事件
     */
    onEditShortName(e) {
      console.log('[template-selector] 编辑模板简称:', e.detail);
      this.triggerEvent('editShortName', e.detail);
    },

    /**
     * 处理删除模板事件
     */
    onDeleteTemplate(e) {
      console.log('[template-selector] 删除模板:', e.detail);
      this.triggerEvent('deleteTemplate', e.detail);
    },

    /**
     * 选择自定义模板
     */
    selectCustom() {
      // 记录日志
      console.log('[template-selector] 选择自定义 - 组件类型:', this.data.type);
      
      this.triggerEvent('custom', {
        type: this.data.type
      });
      
      // 也提供触感反馈，保持一致的用户体验
      wx.vibrateShort({
        type: 'light'
      });
    },

    /**
     * 处理长按事件
     */
    handleLongPress(e) {
      const templateId = e.currentTarget.dataset.id;
      const template = this.data.templates.find(t => t.id === templateId);
      
      console.log('[template-selector] 长按事件触发，模板ID:', templateId);
      console.log('[template-selector] 找到模板:', template ? '是' : '否');
      
      if (template) {
        console.log('[template-selector] 模板isCustom属性:', template.isCustom, '类型:', typeof template.isCustom);
        console.log('[template-selector] 完整模板数据:', template);
      }
      
      if (template && template.isCustom) {
        // 提供触感反馈
        wx.vibrateShort({ type: 'medium' });
        
        // 记录日志，优先使用title字段
        const templateName = template.title || template.name || '未命名模板';
        console.log('[template-selector] 长按自定义模板:', templateName);
        console.log('[template-selector] 模板详情:', {
          id: template.id,
          title: template.title,
          name: template.name,
          shortName: template.shortName,
          taskType: template.taskType
        });
        
        // 显示操作菜单
        wx.showActionSheet({
          itemList: ['修改简称', '删除常用任务'],
          success: (res) => {
            if (res.tapIndex === 0) {
              // 修改简称 - 使用自定义弹窗
              this.showEditModal(template);
            } else if (res.tapIndex === 1) {
              // 删除任务
              this.confirmDelete(template);
            }
          }
        });
      } else {
        console.log('[template-selector] 长按未触发操作菜单，可能原因：模板为空或不是自定义模板');
      }
    },

    /**
     * 显示编辑简称弹窗
     */
    showEditModal(template) {
      console.log('[template-selector] 显示编辑简称弹窗:', template.title || template.name);
      
      this.setData({
        editingTemplate: template,
        showEditModal: true
      });
    },

    /**
     * 处理编辑确认
     */
    handleEditConfirm(e) {
      console.log('[template-selector] 编辑确认:', e.detail.value);
      
      // 限制最多4个字符
      const newShortName = e.detail.value.substring(0, 4);
      
      // 关闭弹窗
      this.setData({
        showEditModal: false
      });
      
      // 触发事件，将修改传递给父组件
      this.triggerEvent('editShortName', {
        templateId: this.data.editingTemplate.id,
        newShortName: newShortName,
        template: this.data.editingTemplate,
        type: this.data.type
      });
    },

    /**
     * 处理编辑取消
     */
    handleEditCancel() {
      console.log('[template-selector] 编辑取消');
      
      this.setData({
        showEditModal: false
      });
    },

    /**
     * 确认删除模板
     */
    confirmDelete(template) {
      // 获取模板名称，优先使用title字段
      const templateName = template.title || template.name || '未命名模板';
      
      wx.showModal({
        title: '确认删除',
        content: `确定要删除常用任务"${templateName}"吗？`,
        success: (res) => {
          if (res.confirm) {
            // 触发删除事件
            this.triggerEvent('deleteTemplate', {
              templateId: template.id,
              template: template,
              type: this.data.type
            });
          }
        }
      });
    }
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      // 根据type设置对应的样式类
      const typeMap = {
        'study': 'study',
        'habit': 'habit',
        'interest': 'interest'
      };
      
      this.setData({
        typeClass: typeMap[this.data.type] || 'study'
      });
      
      console.log('[template-selector] 组件已载入，类型:', this.data.type, '样式类:', this.data.typeClass);
      console.log('[template-selector] 组件属性:', {
        type: this.data.type,
        title: this.data.title,
        selectedId: this.data.selectedId,
        templates: this.data.templates.length,
        maxDisplay: this.data.maxDisplay
      });
    }
  }
}); 