Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    note: {
      type: Object,
      value: null
    }
  },

  methods: {
    preventBubble() {
      return false;
    },

    onLaterTap() {
      this.triggerEvent('later', {});
    },

    onDetailTap() {
      this.triggerEvent('detail', {});
    }
  }
});
