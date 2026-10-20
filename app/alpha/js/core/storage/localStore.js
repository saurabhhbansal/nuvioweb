export const LocalStore = {
  get(key, defaultValue = null, { strict = false } = {}) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? JSON.parse(value) : defaultValue;
    } catch (e) {
      if (strict) throw new Error("Device storage read failed");
      console.error("LocalStore get error:", e);
      return defaultValue;
    }
  },

  set(key, value, { strict = false } = {}) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      if (strict) throw new Error("Device storage write failed");
      console.error("LocalStore set error:", e);
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  clear() {
    localStorage.clear();
  }
};
