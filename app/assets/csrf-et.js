(function (factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([
      'jquery',
      'jquery-deparam',
      'pubsub-js'
    ], factory);
  } else if (typeof exports === 'object') {
    // Node/CommonJS
    module.exports = factory(
      require('jquery'),
      require('jquery-deparam'),
      require('pubsub-js')
    );
  } else {
    // Browser globals
    factory(window.jQuery, window.deparam, window.PubSub);
  }
}(function ($, deparam) {
  var root = Function('return this')(); // jshint ignore:line

  // singleton baby
  if (root.ret) {
    return root.ret;
  }

  // use for IE detection
  var nav = root.navigator;

  // cookie/localStorage value keys
  var INITIAL_CONFIG_KEY  = 'default',
      SAVED_CONFIG_KEY    = 'currentConfigName',
      SAVED_CREDS_KEY     = 'authHeaders';

  // broadcast message event name constants (use constants to avoid typos)
  var VALIDATION_SUCCESS             = 'auth.validation.success',
      VALIDATION_ERROR               = 'auth.validation.error';

  var Ret = function () {
    // set flag so we know when plugin has been configured.
    this.configured = false;

    // create promise for configuration + verification
    this.configDfd = null;

    // configs hash allows for multiple configurations
    this.configs = {};

    // default config will be first named config or "default"
    this.defaultConfigKey = null;

    // save reference to user
    this.user = {};

    // base config from which other configs are extended
    this.configBase = {
      apiUrl:                '/api',
      storage:               'cookies',
      proxyIf:               function() { return false; },
      proxyUrl:              '/proxy',

      // TODO: add userId when available
      tokenFormat: {
        "X-User-Id": "{{ user-id }}",
        "X-Initial-Nonce": "{{ initial-nonce }}",
        "X-Encrypted-Token": "{{ encrypted-token }}"
      }

    };
  };


  // mostly for testing. reset all config values
  Ret.prototype.reset = function() {
    // clean up session without relying on `getConfig`
    this.destroySession();

    this.configs           = {};

    // remove event listeners
    $(document).unbind('ajaxComplete', this.updateRetCredentials);

    if (root.removeEventListener) {
      root.removeEventListener('message', this.handlePostMessage);
    }

    // remove global ajax "interceptors"
    $.ajaxSetup({beforeSend: undefined});
  };


  Ret.prototype.invalidateTokens = function() {
    // clear user object, but don't destroy object in case of bindings
    for (var key in this.user) {
      delete this.user[key];
    }

    // clear auth session data
    this.deleteData(SAVED_CONFIG_KEY);
    this.deleteData(SAVED_CREDS_KEY);
  };


  // throw clear errors when dependencies are not met
  Ret.prototype.checkDependencies = function() {
    var errors = [],
      warnings = [];

      if (!$) {
        throw 'RET: jQuery not found. This module depends on jQuery.';
      }

      if (!root.localStorage && !$.cookie) {
        errors.push(
          'This browser does not support localStorage. You must install '+
            'jquery-cookie to use RET with this browser.'
        );
      }

      if (!deparam) {
        errors.push('Dependency not met: jquery-deparam.');
      }

      if (errors.length) {
        var errMessage = errors.join(' ');
        throw 'RET: Please resolve the following errors: ' + errMessage;
      }

      if (warnings.length && console && console.warn) {
        var warnMessage = warnings.join(' ');
        console.warn('RET: Warning: ' + warnMessage);
      }
  };

  // need a way to destroy the current session without relying on `getConfig`.
  // otherwise we get into infinite loop territory.
  Ret.prototype.destroySession = function() {
    var sessionKeys = [
      SAVED_CREDS_KEY,
      SAVED_CONFIG_KEY
    ];

    for (var key in sessionKeys) {
      key = sessionKeys[key];

      // kill all local storage keys
      if (root.localStorage) {
        root.localStorage.removeItem(key);
      }

      if ($.cookie) {
        // each config may have different cookiePath settings
        for (var config in this.configs) {
          var cookiePath = this.configs[config].cookiePath;

          $.removeCookie(key, {
            path: cookiePath
          });
        }

        // remove from base path in case config is not specified
        $.removeCookie(key, {
          path: "/"
        });
      }
    }
  };


  Ret.prototype.configure = function(opts, reset) {
    // destroy all session data. useful for testing
    if (reset) {
      this.reset();
    }

    if (this.configured) {
      return this.configDfd;
    }

    // set flag so configure isn't called again (unless reset)
    this.configured = true;

    // normalize opts into object object
    if (!opts) {
      opts = {};
    }

    // normalize so opts is always an array of objects
    if (opts.constructor !== Array) {
      // single config will always be called 'default' unless set
      // by previous session
      this.defaultConfigKey = INITIAL_CONFIG_KEY;

      // config should look like {default: {...}}
      var defaultConfig = {};
      defaultConfig[this.defaultConfigKey] = opts;

      // opts should look like [{default: {...}}]
      opts = [defaultConfig];
    }

    // iterate over config items, extend each from defaults
    for (var i = 0; i < opts.length; i++) {
      var configName = getFirstObjectKey(opts[i]);

      // set first set as default config
      if (!this.defaultConfigKey) {
        this.defaultConfigKey = configName;
      }

      // save config to `configs` hash
      this.configs[configName] = $.extend(
        {}, this.configBase, opts[i][configName]
      );
    }

    // ensure that setup requirements have been met
    this.checkDependencies();

    // TODO: add config option for these bindings
    if (true) {
      // update auth creds after each request to the API
      $(document).ajaxComplete(root.ret.updateRetCredentials);

      // intercept requests to the API, append auth headers
      $.ajaxSetup({beforeSend: root.ret.appendHeaders});
    }

    // IE8 won't have this feature
    if (root.addEventListener) {
      root.addEventListener("message", this.handlePostMessage, false);
    }

    // pull creds from search bar if available
    this.processSearchParams();

    // don't validate the token if we're just going to redirect anyway.
    // otherwise the page won't have time to process the response header and
    // the token may expire before the redirected page can validate.
    if (this.willRedirect) {
      return false;
    }

    // don't validate with the server if the credentials were provided. this is
    // a case where the validation happened on the server and is being used to
    // initialize the client.
    else if (this.getConfig().initialCredentials) {
      // skip initial headers check (i.e. check was already done server-side)
      var c = this.getConfig();
      return new $.Deferred().resolve(c.initialCredentials.user);
    }

    // otherwise check with server if any existing tokens are found
    else {
      // validate token if set
      this.configDfd = this.validateToken({config: this.getCurrentConfigName()});
      return this.configDfd;
    }
  };


  Ret.prototype.getApiUrl = function() {
    var config = this.getConfig();
    return (config.proxyIf()) ? config.proxyUrl : config.apiUrl;
  };


  // interpolate values of tokenFormat hash with ctx, return new hash
  Ret.prototype.buildRetHeaders = function(ctx) {
    var headers = {},
      fmt = this.getConfig().tokenFormat;

      for (var key in fmt) {
        headers[key] = tmpl(fmt[key], ctx);
      }

      return headers;
  };



  Ret.prototype.handlePostMessage = function(ev) {
    var stopListening = false;

    if (ev.data.message === 'deliverCredentials') {
      delete ev.data.message;

      var initialHeaders = root.ret.normalizeTokenKeys(ev.data),
          authHeaders    = root.ret.buildRetHeaders(initialHeaders);

      root.ret.broadcastEvent(VALIDATION_SUCCESS, user);

      stopListening = true;
    }

    if (ev.data.message === 'authFailure') {

      stopListening = true;
    }

  };


  // compensate for poor naming decisions made early on
  // TODO: fix API so this isn't necessary
  Ret.prototype.normalizeTokenKeys = function(params) {
    // normalize keys
    if (params.config) {
      this.persistData(
        SAVED_CONFIG_KEY,
        params.config,
        params.config
      );
      delete params.config;
    }


    return params;
  };


  Ret.prototype.processSearchParams = function() {
    var searchParams  = this.getQs(),
        newHeaders    = null;

    searchParams = this.normalizeTokenKeys(searchParams);

    // only bother with this if minimum search params are present
    if (searchParams['client-nonce'] && searchParams.uid) {
      newHeaders = this.buildRetHeaders(searchParams);

      // save all token headers to session
      this.persistData(SAVED_CREDS_KEY, newHeaders);

      // TODO: set uri flag on devise_token_auth for ORet confirmation
      // when using hard page redirects.

      // set qs without auth keys/values
      var newLocation = this.getLocationWithoutParams([
        'client-nonce',
        'token',
        'auth_token',
        'config',
        'client',
        'client_id',
        'expiry',
        'uid',
        'reset_password',
        'account_confirmation_success'
      ]);

      this.willRedirect = true;
      this.setLocation(newLocation);
    }

    return newHeaders;
  };


  // this method is tricky. we want to reconstruct the current URL with the
  // following conditions:
  // 1. search contains none of the supplied keys
  // 2. anchor search (i.e. `#/?key=val`) contains none of the supplied keys
  // 3. all of the keys NOT supplied are presevered in their original form
  // 4. url protocol, host, and path are preserved
  Ret.prototype.getLocationWithoutParams = function(keys) {
    // strip all values from both actual and anchor search params
    var newSearch   = $.param(this.stripKeys(this.getSearchQs(), keys)),
        newAnchorQs = $.param(this.stripKeys(this.getAnchorQs(), keys)),
        newAnchor   = root.location.hash.split('?')[0];

    if (newSearch) {
      newSearch = "?" + newSearch;
    }

    if (newAnchorQs) {
      newAnchor += "?" + newAnchorQs;
    }

    if (newAnchor && !newAnchor.match(/^#/)) {
      newAnchor = "#/" + newAnchor;
    }

    // reconstruct location with stripped auth keys
    var newLocation = root.location.protocol +
        '//'+
        root.location.host+
        root.location.pathname+
        newSearch+
        newAnchor;

    return newLocation;
  };


  Ret.prototype.stripKeys = function(obj, keys) {
    for (var q in keys) {
      delete obj[keys[q]];
    }

    return obj;
  };


  // abstract publish method, only use if pubsub exists.
  // TODO: allow broadcast method to be configured
  Ret.prototype.broadcastEvent = function(msg, data) {
    if (PubSub.publish) {
      PubSub.publish(msg, data);
    }
  };



  // always resolve after 0 timeout to ensure that ajaxComplete callback
  // has run before promise is resolved
  Ret.prototype.resolvePromise = function(evMsg, dfd, data) {
    var self = this,
        finished = $.Deferred();

    setTimeout(function() {
      self.broadcastEvent(evMsg, data);
      dfd.resolve(data);
      finished.resolve();
    }, 0);

    return finished.promise();
  };


  Ret.prototype.rejectPromise = function(evMsg, dfd, data, reason) {
    var self = this;

    // jQuery has a strange way of returning error responses...
    data = $.parseJSON((data && data.responseText) || '{}');

    // always reject after 0 timeout to ensure that ajaxComplete callback
    // has run before promise is rejected
    setTimeout(function() {
      self.broadcastEvent(evMsg, data);
      dfd.reject({
        reason: reason,
        data: data
      });
    }, 0);

    return dfd;
  };


  // TODO: document
  Ret.prototype.validateToken = function(opts) {
    if (!opts) {
      opts = {};
    }

    if (!opts.config) {
      opts.config = this.getCurrentConfigName();
    }

    // if this check is already in progress, return existing promise
    if (this.configDfd) {
      return this.configDfd;
    }

    var dfd = $.Deferred();

    // no creds, reject promise without making API call
    if (!this.retrieveData(SAVED_CREDS_KEY)) {
      // clear any saved session data
      this.invalidateTokens();

      // reject promise, broadcast event
      this.rejectPromise(
        VALIDATION_ERROR,
        dfd,
        {},
        'Cannot validate token; no token found.'
      );
    } else {
      var config = this.getConfig(opts.config),
          url    = this.getApiUrl() + config.tokenValidationPath;

      // found saved creds, verify with API
      $.ajax({
        url:     url,
        context: this,

        success: function(resp) {
          var user = config.handleTokenValidationResponse(resp);

          this.resolvePromise(VALIDATION_SUCCESS, dfd, this.user);
        },

        error: function(resp) {
          // clear any saved session data
          this.invalidateTokens();

          this.rejectPromise(
            VALIDATION_ERROR,
            dfd,
            resp,
            'Cannot validate token; token rejected by server.'
          );
        }
      });
    }

    return dfd.promise();
  };



  // abstract storing of session data
  Ret.prototype.persistData = function(key, val, config) {
    val = JSON.stringify(val);

    switch (this.getConfig(config).storage) {
      case 'localStorage':
        root.localStorage.setItem(key, val);
        break;

      default:
        $.cookie(key, val, {
          expires: this.getConfig(config).cookieExpiry,
          path:    this.getConfig(config).cookiePath
        });
        break;
    }
  };


  // abstract reading of session data
  Ret.prototype.retrieveData = function(key) {
    var val = null;

    switch (this.getConfig().storage) {
      case 'localStorage':
        val = root.localStorage.getItem(key);
        break;

      default:
        val = $.cookie(key);
        break;
    }

    // if value is a simple string, the parser will fail. in that case, simply
    // unescape the quotes and return the string.
    try {
      // return parsed json response
      return $.parseJSON(val);
    } catch (err) {
      // unescape quotes
      return unescapeQuotes(val);
    }
  };


  // this method cannot rely on `retrieveData` because `retrieveData` relies
  // on `getConfig` and we need to get the config name before `getConfig` can
  // be called. TL;DR prevent infinite loop by checking all forms of storage
  // and returning the first config name found
  Ret.prototype.getCurrentConfigName = function() {
    var configName = null;

    if (this.getQs().config) {
      configName = this.getQs().config;
    }

    if ($.cookie && !configName) {
      configName = $.cookie(SAVED_CONFIG_KEY);
    }

    if (root.localStorage && !configName) {
      configName = root.localStorage.getItem(SAVED_CONFIG_KEY);
    }

    configName = configName || this.defaultConfigKey || INITIAL_CONFIG_KEY;

    return unescapeQuotes(configName);
  };


  // abstract deletion of session data
  Ret.prototype.deleteData = function(key) {
    switch (this.getConfig().storage) {
      case 'cookies':
        $.removeCookie(key, {
          path: this.getConfig().cookiePath
        });
        break;

      default:
        root.localStorage.removeItem(key);
        break;
    }
  };


  // return the current config. config will take the following precedence:
  // 1. config by name saved in cookie / localstorage (current auth)
  // 2. first available configuration
  // 2. default config
  Ret.prototype.getConfig = function(key) {
    // configure if not configured
    if (!this.configured) {
      throw 'RET: `configure` must be run before using this plugin.';
    }

    // fall back to default unless config key is passed
    key = key || this.getCurrentConfigName();

    return this.configs[key];
  };


  // send auth credentials with all requests to the API
  Ret.prototype.appendHeaders = function(xhr, settings) {
    // fetch current auth headers from storage
    var currentHeaders = root.ret.retrieveData(SAVED_CREDS_KEY);

    // don't leak tokens in GET / HEAD requests.
    var method = settings.type;
    if (currentHeaders !== null && ['GET', 'HEAD'].includes(method)) {
      return root.ret.appendRetAuthHeaders(xhr, settings);
    }
    else {
      return root.ret.appendRetHeaders(xhr, settings);
    }
  };

  Ret.prototype.generateNonce = function() {
    console.warn('This implementation is TEMPORARY.  DO NOT rely on this!');
    return Math.random() + "";
  },

  // send auth credentials with all requests to the API
  Ret.prototype.appendRetHeaders = function(xhr, settings) {
    xhr.setRequestHeader(
      'X-Initial-Nonce',
      root.ret.generateNonce()
    );

    // set header for each key in `tokenFormat` config
    // for (var key in root.ret.getConfig().tokenFormat) {
    //   xhr.setRequestHeader(key, currentHeaders[key]);
    // }
  };


  // send auth credentials with all requests to the API
  Ret.prototype.appendRetAuthHeaders = function(xhr, settings) {
    // fetch current auth headers from storage
    var currentHeaders = root.ret.retrieveData(SAVED_CREDS_KEY);

    // check config apiUrl matches the current request url
    // if (isApiRequest(settings.url) && currentHeaders) {
    if (isApiRequest(settings.url) && currentHeaders) {

      // bust IE cache
      xhr.setRequestHeader(
        'If-Modified-Since',
        'Thu, 1 Jan 1970 00:00:00 GMT'
      );

      // set header for each key in `tokenFormat` config
      for (var key in root.ret.getConfig().tokenFormat) {
        xhr.setRequestHeader(key, currentHeaders[key]);
      }
    }
  };


  // update auth credentials after request is made to the API
  Ret.prototype.updateRetCredentials = function(ev, xhr, settings) {
    // check config apiUrl matches the current response url
    console.info('updating ret creds!', isApiRequest(settings.url));
    // TODO FIXME:
    if (true || isApiRequest(settings.url)) {
      // set header for each key in `tokenFormat` config
      var newHeaders = {};

      // set flag to ensure that we don't accidentally nuke the headers
      // if the response tokens aren't sent back from the API
      var blankHeaders = true;

      // set header key + val for each key in `tokenFormat` config
      for (var key in root.ret.getConfig().tokenFormat) {
        var responseValue = xhr.getResponseHeader(key);

        if (responseValue && responseValue !== null) {
          newHeaders[key] = responseValue;
          blankHeaders = false;
        }

      }

      // persist headers for next request
      if (!blankHeaders) {
        root.ret.persistData(SAVED_CREDS_KEY, newHeaders);
      }
    }
  };


  // stub for mock overrides
  Ret.prototype.getRawSearch = function() {
    return root.location.search;
  };


  // stub for mock overrides
  Ret.prototype.getRawAnchor = function() {
    return root.location.hash;
  };


  Ret.prototype.setRawAnchor = function(a) {
    root.location.hash = a;
  };


  Ret.prototype.getAnchorSearch = function() {
    var arr = this.getRawAnchor().split('?');
    return (arr.length > 1) ? arr[1] : null;
  };


  // stub for mock overrides
  Ret.prototype.setRawSearch = function(s) {
    root.location.search = s;
  };


  // stub for mock overrides
  Ret.prototype.setSearchQs = function(params) {
    this.setRawSearch($.param(params));
    return this.getSearchQs();
  };


  Ret.prototype.setAnchorQs = function(params) {
    this.setAnchorSearch($.param(params));
    return this.getAnchorQs();
  };


  // stub for mock overrides
  Ret.prototype.setLocation = function(url) {
    root.location.replace(url);
  };


  // stub for mock overrides
  Ret.prototype.createPopup = function(url) {
    return root.open(url);
  };


  Ret.prototype.getSearchQs = function() {
    var qs    = this.getRawSearch().replace('?', ''),
        qsObj = (qs) ? deparam(qs) : {};

    return qsObj;
  };


  Ret.prototype.getAnchorQs = function() {
    var anchorQs    = this.getAnchorSearch(),
        anchorQsObj = (anchorQs) ? deparam(anchorQs) : {};

    return anchorQsObj;
  };


  // stub for mock overrides
  Ret.prototype.getQs = function() {
    return $.extend(this.getSearchQs(), this.getAnchorQs());
  };


  // private util methods
  var getFirstObjectKey = function(obj) {
    for (var key in obj) {
      return key;
    }
  };


  var unescapeQuotes = function(val) {
    return val && val.replace(/("|')/g, '');
  };


  var isApiRequest = function(url) {
    return (url.match(root.ret.getApiUrl()));
  };


  // simple string templating. stolen from:
  // http://stackoverflow.com/questions/14879866/javascript-templating-function-replace-string-and-dont-take-care-of-whitespace
  var tmpl = function(str, obj) {
    var replacer = function(wholeMatch, key) {
      return obj[key] === undefined ? wholeMatch : obj[key];
    },
    regexp = new RegExp('{{\\s*([a-z0-9-_]+)\\s*}}',"ig");

    for(var beforeReplace = ""; beforeReplace !== str; str = (beforeReplace = str).replace(regexp, replacer)){

    }
    return str;
  };


  // check if IE < 10
  root.isOldIE = function() {
    var oldIE = false,
        ua    = nav.userAgent.toLowerCase();

    if (ua && ua.indexOf('msie') !== -1) {
      var version = parseInt(ua.split('msie')[1]);
      if (version < 10) {
        oldIE = true;
      }
    }

    return oldIE;
  };


  // check if using IE
  root.isIE = function() {
    var ieLTE10 = root.isOldIE(),
        ie11    = !!nav.userAgent.match(/Trident.*rv\:11\./);

    return (ieLTE10 || ie11);
  };


  // export service
  root.ret = $.ret = new Ret();

  return root.ret;
}));
