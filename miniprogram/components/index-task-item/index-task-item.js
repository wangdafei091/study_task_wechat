Component({
  properties: {
    task: {
      type: Object,
      value: {}
    }
  },
  data: {
    // ... existing code ...
  },
  methods: {
    // ... existing code ...
    onTaskClick() {
      const { task } = this.data;
      this.triggerEvent('taskClick', { task });
    }
  }
}); 