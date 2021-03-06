'use strict';

var request = require('request');
var Profile = require('./profile');
var Segment = require('./segment');
var Cache = require('./cache');
var util = require('util');
var querystring = require('querystring');
var validator = require('./validator/index');

/**
 *
 * @param {Object} config
 * @constructor
 */
var InnoHelper = function (config) {
    this.validateConfig(config);
    this.groupId = config.groupId;
    this.apiUrl = config.apiUrl;
    this.evaluationApiUrl = config.evaluationApiUrl;
    this.bucketName = config.bucketName;
    this.appName = config.appName;
    this.appKey = config.appKey;
    this.schedulerApiHost = config.schedulerApiHost;

    if (config.noCache !== undefined) {
        this.noCache = !!config.noCache;
    }

    if (this.isCacheAllowed()) {
        this.cache = new Cache({
            cachedTime: 600
        });
    }
};

InnoHelper.prototype = {

    /**
     * Bucket name
     * @type {String}
     */
    bucketName: null,

    /**
     * Application name
     * @type {String}
     */
    appName: null,

    /**
     * Company id
     * @type {Number|String}
     */
    groupId: null,

    /**
     * Application key
     * @type {String}
     */
    appKey: null,

    /**
     * API url
     * @type {String}
     */
    apiUrl: null,

    /**
     * Evaluation API url
     * @type {String}
     */
    evaluationApiUrl: null,

    /**
     * No cache flag
     * @type {boolean}
     */
    noCache: false,

    /**
     * Cache object
     * @type {Object}
     */
    cache: null,

    /**
     * Scheduler API host
     * @type {String}
     */
    schedulerApiHost: null,

    /**
     * Get Scheduler Api url
     * @returns {String}
     */
    getSchedulerApiHost: function () {
        return this.schedulerApiHost;
    },

    /**
     * Build Url for API request to scheduler
     * @returns {String}
     * @protected
     */
    getSchedulerApiUrl: function (params) {
        var optional = '';
        if (params) {
            if (params.taskId) {
                optional = '/' + params.taskId;
            } else if (params.getTasksAsString) {
                optional = '/tasks';
            }
        }
        return util.format('%s/scheduler/%s%s?token=%s',
            this.getSchedulerApiHost(),
            this.getSchedulerId(),
            optional,
            this.getSchedulerToken());
    },

    /**
     * Get Scheduler id
     * @returns {String}
     */
    getSchedulerId: function () {
        return this.getCompany() + '-' + this.getBucket() + '-' + this.getCollectApp();
    },

    /**
     * Get Scheduler token
     * @returns {String}
     */
    getSchedulerToken: function () {
        return this.getAppKey();
    },

    /**
     * Get application tasks
     * @param {Function} callback
     */
    getTasks: function (callback) {
        var self = this;
        var opts = {
            url: this.getSchedulerApiUrl(),
            json: true
        };

        request.get(opts, function (error, response) {
            error = self.checkErrors(error, response, 200);

            if (typeof callback === 'function') {
                if (error) {
                    return callback(error);
                }
                return callback(null, response.body);
            }
        });
    },

    /**
     * Get list of application tasks
     * @param {Function} callback
     */
    getListTasks: function (callback) {
        var self = this;
        var opts = {
            url: this.getSchedulerApiUrl({
                getTasksAsString: true
            }),
            json: true
        };

        request.get(opts, function (error, response) {
            error = self.checkErrors(error, response, 200);

            if (typeof callback === 'function') {
                if (error) {
                    return callback(error);
                }
                return callback(null, response.body);
            }
        });
    },

    /**
     * Add application task
     * @param {Object} params
     *
     *     @example
     *     {
     *         "endpoint": "string", // required
     *         "method": "string", // required
     *         "headers": {},
     *         "id": "string",
     *         "payload": "string",
     *         "timestamp": 0,
     *         "delay": 0
     *     }
     *
     * @param {Function} callback
     */
    addTask: function (params, callback) {
        var self = this;
        var timestampExists = params.hasOwnProperty('timestamp'),
            delayExists = params.hasOwnProperty('delay');

        if (!timestampExists && !delayExists) {
            return callback(new Error('Either use timestamp or delay'));
        }

        if (timestampExists && delayExists) {
            return callback(new Error('You should use only one field: timestamp or delay'));
        }

        var opts = {
            url: this.getSchedulerApiUrl(),
            body: params,
            json: true
        };

        request.post(opts, function (error, response) {
            if (response) {
                response.body = response.body || 'no body';
            }
            error = self.checkErrors(error, response, 201);

            if (typeof callback === 'function') {
                if (error) {
                    return callback(error);
                }
                return callback(null);
            }
        });
    },

    /**
     * Delete application task
     * @param {Object} params
     *
     *     @example
     *     {
     *         "taskId": "string", // required
     *     }
     *
     * @param {Function} callback
     */
    deleteTask: function (params, callback) {
        var self = this;
        if (!params.hasOwnProperty('taskId')) {
            return callback(new Error('Parameter "taskId" required'));
        }

        var opts = {
            url: this.getSchedulerApiUrl(params),
            json: true
        };

        request.del(opts, function (error, response) {
            if (response) {
                response.body = response.body || 'no body';
            }
            error = self.checkErrors(error, response, 204);

            if (typeof callback === 'function') {
                if (error) {
                    return callback(error);
                }
                return callback(null);
            }
        });
    },

    /**
     * Build Url for API request to work with certain Profile
     * @param {String} profileId
     * @returns {String}
     * @protected
     */
    getProfileUrl: function (profileId) {
        return util.format('%s/v1/companies/%s/buckets/%s/profiles/%s?app_key=%s',
            this.getApiHost(),
            this.getCompany(),
            this.getBucket(),
            profileId,
            this.getAppKey());
    },

    /**
     * Build Url for API request to work with application settings
     * @returns {String}
     * @protected
     */
    getAppSettingsUrl: function () {
        return util.format('%s/v1/companies/%s/buckets/%s/apps/%s/custom?app_key=%s',
            this.getApiHost(),
            this.getCompany(),
            this.getBucket(),
            this.getCollectApp(),
            this.getAppKey());
    },

    /**
     * Build Url for API request to work with segments
     * @returns {String}
     * @protected
     */
    getSegmentsUrl: function () {
        return util.format('%s/v1/companies/%s/buckets/%s/segments?app_key=%s',
            this.getApiHost(),
            this.getCompany(),
            this.getBucket(),
            this.getAppKey());
    },

    /**
     * Build Url for API request to work with segments
     * @param {Object} params
     * @returns {String}
     */
    getSegmentEvaluationUrl: function (params) {
        var typeSegmentEvaluation = params.typeSegmentEvaluation;
        delete params.typeSegmentEvaluation;

        return util.format('%s/companies/%s/buckets/%s/%s?app_key=%s&%s',
            this.getEvaluationApiHost(),
            this.getCompany(),
            this.getBucket(),
            typeSegmentEvaluation,
            this.getAppKey(),
            querystring.stringify(params));
    },

    /**
     * Get application name
     * @returns {String}
     */
    getCollectApp: function () {
        return this.appName;
    },

    /**
     * Get bucket name
     * @returns {String}
     */
    getBucket: function () {
        return this.bucketName;
    },

    /**
     * Get company id
     * @returns {Number|String}
     */
    getCompany: function () {
        return this.groupId;
    },

    /**
     * Get application key
     * @returns {String}
     */
    getAppKey: function () {
        return this.appKey;
    },

    /**
     * Get Api url
     * @returns {String}
     */
    getApiHost: function () {
        return this.apiUrl;
    },

    /**
     * Get evaluation Api url
     * @returns {String}
     */
    getEvaluationApiHost: function () {
        return this.evaluationApiUrl;
    },

    /**
     * Is cache allowed?
     * @returns {boolean}
     */
    isCacheAllowed: function () {
        return !this.noCache;
    },

    /**
     * Set cache admission
     * @returns {boolean}
     */
    setCacheAllowed: function (value) {
        this.noCache = !value;
    },

    /**
     * Update application settings
     * @param {Object} settings
     * @param {Function} callback
     */
    setAppSettings: function (settings, callback) {
        var self = this,
            error = null;

        if (!settings) {
            error = new Error('Settings not found');
            callback(error, null);
            return;
        }

        var cacheAllowed = this.isCacheAllowed();
        var opts = {
            url: this.getAppSettingsUrl(),
            body: settings,
            json: true
        };

        request.put(opts, function (error, response) {
            var settings = null;
            error = self.checkErrors(error, response);

            if (!error) {
                error = self.validateObject(response.body, 'custom');
            }

            if (!error) {
                settings = response.body.custom;

                if (cacheAllowed) {
                    self.cache.set(self.getCacheKey('settings'), settings);
                }
            }

            if (typeof callback === 'function') {
                return callback(error, settings);
            }
        });
    },

    /**
     * Get application settings
     * @param {Function} callback
     */
    getAppSettings: function (callback) {
        var self = this;
        var opts = {
            url: this.getAppSettingsUrl(),
            json: true
        };
        var cache = this.cache;
        var cacheAllowed = this.isCacheAllowed();
        var cachedValue;

        if (cacheAllowed) {
            cachedValue = cache.get(this.getCacheKey('settings'));
            if (typeof cachedValue !== 'undefined') {
                callback(null, cachedValue);
                return;
            }
        }

        request.get(opts, function (error, response) {
            var settings = null;
            error = self.checkErrors(error, response);

            if (!error) {
                error = self.validateObject(response.body, 'custom');
            }

            if (!error) {
                settings = response.body.custom;
                if (cacheAllowed) {
                    cache.set(self.getCacheKey('settings'), settings);
                }
            }

            callback(error, settings);
        });
    },

    /**
     * Get segments
     * @param {Function} callback
     */
    getSegments: function (callback) {
        var self = this;
        var opts = {
            url: this.getSegmentsUrl(),
            json: true
        };

        request.get(opts, function (error, response) {
            var data = null;
            var segments = [];

            error = self.checkErrors(error, response);

            if (!error) {
                data = response.body;
                data = util.isArray(data) ? data : [];
                data.forEach(function (sgmData) {
                    var sgmInstance = null;
                    if (sgmData.hasOwnProperty('segment') && typeof sgmData.segment === 'object') {
                        try {
                            sgmInstance = new Segment(sgmData.segment);
                            segments.push(sgmInstance);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                });
            }

            callback(error, segments);
        });
    },

    /**
     * Evaluate profile by segment
     * @param {Profile} profile
     * @param {Segment} segment
     * @param {Function} callback
     */
    evaluateProfileBySegment: function (profile, segment, callback) {
        var error = null;
        var result = null;
        if (!(segment instanceof Segment)) {
            error = new Error('Argument "segment" should be a Segment instance');
            return callback(error, result);
        }

        this.evaluateProfileBySegmentId(profile, segment.getId(), callback);
    },

    /**
     * Evaluate profile by segment's id
     * @param {Profile} profile
     * @param {String|Array} segmentIds
     * @param {Function} callback
     */
    evaluateProfileBySegmentId: function (profile, segmentIds, callback) {
        segmentIds = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
        this._evaluateProfileByParams(profile, {
            segment_id: segmentIds,
            typeSegmentEvaluation: 'segment-id-evaluation'
        }, callback);
    },

    /**
     * Evaluate profile by IQL expression
     * @param {Profile} profile
     * @param {String|Array} iqls
     * @param {Function} callback
     */
    evaluateProfileByIql: function (profile, iqls, callback) {
        iqls = Array.isArray(iqls) ? iqls : [iqls];
        this._evaluateProfileByParams(profile, {
            iql: iqls,
            typeSegmentEvaluation: 'iql-evaluation'
        }, callback);
    },

    /**
     *
     * @param {String} profileId
     * @param {Function} callback
     */
    loadProfile: function (profileId, callback) {
        var self = this;
        var opts = {
            url: this.getProfileUrl(profileId),
            json: true
        };

        request.get(opts, function (error, response) {
            var data = null;
            var profile = null;

            error = self.checkErrors(error, response);

            if (!error) {
                data = response.body;
                if (data.hasOwnProperty('profile') && typeof data.profile === 'object') {
                    try {
                        profile = new Profile(data.profile);
                        profile.resetDirty();
                    } catch (e) {
                        error = e;
                    }
                }
            }

            callback(error, profile);
        });
    },

    /**
     * Make Api request to delete profile
     * @param {String} profileId
     * @param {Function} callback
     */
    deleteProfile: function (profileId, callback) {
        var self = this;
        var opts = {
            url: this.getProfileUrl(profileId),
            json: true
        };

        request.del(opts, function (error, response) {
            error = self.checkErrors(error, response, 204);

            if (typeof callback === 'function') {
                return callback(error);
            }
        });
    },

    /**
     * Make Api request to save profile in DH
     * @param {Profile} profile
     * @param {Function} callback
     */
    saveProfile: function (profile, callback) {
        var self = this;
        var error = null;
        var result = null;

        if (!(profile instanceof Profile)) {
            error = new Error('Argument "profile" should be a Profile instance');
            if (typeof callback === 'function') {
                return callback(error, result);
            }
            return;
        }

        var profileId = profile.getId();
        var bodyProfile = profile.serialize(true);

        if (!validator.profileIsValid(bodyProfile)) {
            error = new Error('Profile is not valid');
            if (typeof callback === 'function') {
                return callback(error, result);
            }
            return;
        }

        var opts = {
            url: this.getProfileUrl(profileId),
            body: bodyProfile,
            json: true
        };

        request.post(opts, function (error, response) {
            var data;
            error = self.checkErrors(error, response, [200, 201]);

            if (!error) {
                data = response.body;
                if (data.hasOwnProperty('profile') && typeof data.profile === 'object') {
                    try {
                        profile = new Profile(data.profile);
                        profile.resetDirty();
                    } catch (e) {
                        error = e;
                    }
                }
            }

            if (typeof callback === 'function') {
                return callback(error, profile);
            }
        });
    },

    /**
     * Make Api request to merge two profiles
     * @param {Profile} profile1 Profile-recipient which will receive data from the profile-donor.
     * @param {Profile} profile2 Profile-donor which will be merged in profile-recipient. ID of this profile will appear in mergedProfiles list
     * @param {Function} callback
     */
    mergeProfiles: function (profile1, profile2, callback) {
        var self = this;
        var error = null;
        var result = null;

        if (!(profile1 instanceof Profile)) {
            error = new Error('Argument "profile1" should be a Profile instance');
        } else if (!(profile2 instanceof Profile)) {
            error = new Error('Argument "profile2" should be a Profile instance');
        }

        if (error) {
            if (typeof callback === 'function') {
                return callback(error, result);
            }
            return;
        }

        var profileId = profile1.getId();
        var opts = {
            url: this.getProfileUrl(profileId),
            body: {
                id: profileId,
                mergedProfiles: [
                    profile2.getId()
                ]
            },
            json: true
        };

        request.post(opts, function (error, response) {
            var data;
            var profile = null;

            error = self.checkErrors(error, response, [200, 201]);

            if (!error) {
                data = response.body;
                if (data.hasOwnProperty('profile') && typeof data.profile === 'object') {
                    try {
                        profile = new Profile(data.profile);
                        profile.resetDirty();
                    } catch (e) {
                        error = e;
                    }
                }
            }

            if (typeof callback === 'function') {
                return callback(error, profile);
            }
        });
    },

    /**
     * Refresh  local profile with data from DH
     * @param {Profile} profile
     * @param {Function} callback
     */
    refreshLocalProfile: function (profile, callback) {
        var error = null;
        var result = null;

        if (!(profile instanceof Profile)) {
            error = new Error('Argument "profile" should be a Profile instance');
            if (typeof callback === 'function') {
                return callback(error, result);
            }
            return;
        }

        var profileId = profile.getId();

        this.loadProfile(profileId, function (error, loadedProfile) {
            if (!error) {
                profile.merge(loadedProfile);
            }

            if (typeof callback === 'function') {
                return callback(error, profile);
            }
        });
    },

    /**
     * Try to parse profile data from request made by DH
     * @param {String} requestBody
     * @returns {Profile}
     */
    getProfileFromRequest: function (requestBody) {
        try {
            if (typeof requestBody !== 'object') {
                requestBody = JSON.parse(requestBody);
            }
        } catch (e) {
            throw new Error('Wrong stream data');
        }
        var profile = requestBody.profile;
        if (!profile) {
            throw new Error('Profile not found');
        }
        var profileInstance = new Profile(profile);
        profileInstance.resetDirty();
        return profileInstance;
    },

    /**
     *
     * @param {String} requestBody
     * @returns {Object}
     */
    getMetaFromRequest: function (requestBody) {
        try {
            if (typeof requestBody !== 'object') {
                requestBody = JSON.parse(requestBody);
            }
        } catch (e) {
            throw new Error('Wrong stream data');
        }
        var meta = requestBody.meta;
        if (!meta) {
            throw new Error('Meta not found');
        }
        return meta;
    },

    /**
     * Create empty local profile with certain id
     * @param {String} profileId
     * @returns {Profile}
     */
    createProfile: function (profileId) {
        return new Profile({
            id: profileId,
            version: '1.0',
            sessions: [],
            attributes: [],
            mergedProfiles: []
        });
    },

    /**
     * Checks if config is valid
     * @param {Object} config
     * @private
     */
    validateConfig: function (config) {
        if (!config) {
            throw new Error('Config should be defined');
        }

        if (typeof config !== 'object') {
            throw new Error('Config should be an object');
        }

        this.validateConfigRequiredProps(config);
        this.validateConfigGroupId(config);
    },

    /**
     *
     * @param {Object} config
     * @private
     */
    validateConfigRequiredProps: function (config) {
        ['bucketName', 'appName', 'appKey', 'apiUrl'].forEach(function (field) {
            if (!(field in config)) {
                throw new Error('Property "' + field + '" in config should be defined');
            }
            if (typeof config[field] !== 'string') {
                throw new Error('Property "' + field + '" in config should be a string');
            }
            if (!config[field].trim()) {
                throw new Error('Property "' + field + '" in config can not be empty');
            }
        });
    },

    /**
     *
     * @param {Object} config
     * @private
     */
    validateConfigGroupId: function (config) {
        if (!('groupId' in config)) {
            throw new Error('Property "groupId" in config should be defined');
        }
        if (['string', 'number'].indexOf(typeof config.groupId) === -1) {
            throw new Error('Property "groupId" in config should be a string or a number');
        }
        if (!String(config.groupId).trim()) {
            throw new Error('Property "groupId" in config can not be empty');
        }
    },

    /**
     * Check that certain object has all fields from list
     * @param {Object} obj
     * @param {Array} fields
     * @returns {Error|null}
     * @private
     */
    validateObject: function (obj, fields) {
        var error = null;
        if (typeof obj !== 'object') {
            error = new Error('Object is not defined');
        } else {
            try {
                fields = Array.isArray(fields) ? fields : [fields];
                fields.forEach(function (key) {
                    if (!(key in obj)) {
                        throw new Error(key.toUpperCase() + ' not found');
                    }
                });
            } catch (e) {
                error = e;
            }
        }
        return error;
    },

    /**
     * Check for error and that response has allowed statusCode and required field(s)
     * @param {Error} error
     * @param {Object} response
     * @param {Number|Array} successCode
     * @returns {Error|null}
     * @private
     */
    checkErrors: function (error, response, successCode) {
        successCode = successCode || 200;
        if (!(successCode instanceof Array)) {
            successCode = [successCode];
        }

        if (error) {
            return error;
        }

        if (!response || !response.body) {
            return new Error('Response does not contain data');
        }

        if (successCode.indexOf(response.statusCode) === -1) {
            error = new Error(response.body.message);
            error.name = 'Server failed with status code ' + response.statusCode;
            return error;
        }

        return null;
    },

    /**
     *
     * @param {Profile} profile
     * @param {Object} params
     * @param {Function} callback
     * @private
     */
    _evaluateProfileByParams: function (profile, params, callback) {
        var self = this;
        var error = null;
        var results = null;

        if (!(profile instanceof Profile)) {
            error = new Error('Argument "profile" should be a Profile instance');
            return callback(error, results);
        }

        var defParams = {
            profile_id: profile.getId()
        };

        params = util._extend(params, defParams);

        var opts = {
            url: this.getSegmentEvaluationUrl(params),
            json: true
        };

        request.get(opts, function (error, response) {
            var data;

            error = self.checkErrors(error, response);

            if (!error) {
                data = response.body;
                if (data.hasOwnProperty('segmentEvaluation') && data.segmentEvaluation.hasOwnProperty('results')) {
                    results = data.segmentEvaluation.results;
                    if (results.length === 1) {
                        results = results[0];
                    }
                }
            }

            callback(error, results);
        });
    },

    getCacheKey: function (name) {
        return (name || 'default') + '-' + this.getCollectApp();
    }
};

module.exports = InnoHelper;
