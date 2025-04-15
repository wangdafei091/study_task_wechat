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
    typeClass: 'study' // 默认使用学习样式
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
        // 记录日志
        console.log('模板选择 - templateId:', templateId, 'template:', template, 'componentType:', this.data.type);
        
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
     * 选择自定义模板
     */
    selectCustom() {
      // 记录日志
      console.log('选择自定义 - 组件类型:', this.data.type);
      
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
      
      if (template && template.isCustom) {
        // 提供触感反馈
        wx.vibrateShort({ type: 'medium' });
        
        // 记录日志
        console.log('[template-selector] 长按自定义模板:', template.name);
        
        // 显示操作菜单
        wx.showActionSheet({
          itemList: ['修改简称', '删除常用任务'],
          success: (res) => {
            if (res.tapIndex === 0) {
              // 修改简称
              this.editShortName(template);
            } else if (res.tapIndex === 1) {
              // 删除任务
              this.confirmDelete(template);
            }
          }
        });
      }
    },

    /**
     * 修改模板简称
     */
    editShortName(template) {
      // 弹出输入框让用户输入新简称
      wx.showModal({
        title: '修改简称',
        content: '请输入新的简称（最多4个字符）',
        editable: true,
        placeholderText: template.shortName || template.name.substring(0, 4),
        success: (res) => {
          if (res.confirm && res.content) {
            // 限制最多4个字符
            const newShortName = res.content.substring(0, 4);
            
            // 触发事件，将修改传递给父组件
            this.triggerEvent('editShortName', {
              templateId: template.id,
              newShortName: newShortName,
              template: template,
              type: this.data.type
            });
          }
        }
      });
    },

    /**
     * 确认删除模板
     */
    confirmDelete(template) {
      wx.showModal({
        title: '确认删除',
        content: `确定要删除常用任务"${template.name}"吗？`,
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
      
      console.log('模板选择器组件已载入，类型:', this.data.type, '样式类:', this.data.typeClass);
      console.log('组件properties:', {
        type: this.data.type,
        title: this.data.title,
        selectedId: this.data.selectedId,
        templates: this.data.templates.length,
        maxDisplay: this.data.maxDisplay
      });
      console.log('应用新设计：无边框 + 极淡背景色 + 点击缩放动效 + 匹配任务类型的文字颜色');
    }
  }
}); 