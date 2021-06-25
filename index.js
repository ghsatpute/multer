var makeMiddleware = require('./lib/make-middleware')

var diskStorage = require('./storage/disk')
var memoryStorage = require('./storage/memory')
var MulterError = require('./lib/multer-error')

function allowAll (req, file, cb) {
  cb(null, true)
}

function Multer (options) {
  if (options.storage) {
    this.storage = options.storage
  } else if (options.dest) {
    this.storage = diskStorage({ destination: options.dest })
  } else {
    this.storage = memoryStorage()
  }

  this.limits = options.limits
  this.preservePath = options.preservePath
  this.fileFilter = options.fileFilter || allowAll
}

Multer.prototype._makeMiddleware = function (fields, fileStrategy) {
  function setup () {
    const regexForIndexedNumber = /\[[0-9]+\]/g

    var fileFilter = this.fileFilter
    var filesLeft = Object.create(null)
    var limitsIncludedPathFields = []

    fields.forEach(function (field) {
      if (field.limitsIncludedInPath) {
        limitsIncludedPathFields.push({
          ...field,
          limits: [ ...field.name.match(regexForIndexedNumber) ]
        })
      } else if (typeof field.maxCount === 'number') {
        filesLeft[field.name] = field.maxCount
      } else {
        filesLeft[field.name] = Infinity
      }
    })

    function wrappedFileFilter (req, file, cb) {

      if (filesLeft[file.fieldname] || (filesLeft[file.fieldname] || 0) <= 0) {

        let found = false
        for(const limitsIncludedPathField of limitsIncludedPathFields) {
          if (limitsIncludedPathField.name.replace(regexForIndexedNumber, '[]')
              === file.fieldname.replace(regexForIndexedNumber, '[]')) {

            const fileIndexes = [ ...file.fieldname.match(regexForIndexedNumber), '[0]']

            let i = 0;
            for (; i < limitsIncludedPathField.limits.length && limitsIncludedPathField.limits.length == fileIndexes.length; i++) {
              if (fileIndexes[i] > limitsIncludedPathField.limits[i]) {
                break
              }
            }
            if (i == limitsIncludedPathField.limits.length && i == fileIndexes.length) {
              found = true
              lastLimit = parseInt(limitsIncludedPathField.limits[limitsIncludedPathField.limits.length - 1].slice(1, -1))
              limitsIncludedPathField.limits.pop()
              limitsIncludedPathField.limits.push('[' + (lastLimit - 1) + ']')
              break
            }
          }
        }

        if (!found) {
          return cb(new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname))
        }
      }

      if (filesLeft[file.fieldname]) {
        filesLeft[file.fieldname] -= 1
      }
      fileFilter(req, file, cb)
    }

    return {
      limits: this.limits,
      preservePath: this.preservePath,
      storage: this.storage,
      fileFilter: wrappedFileFilter,
      fileStrategy: fileStrategy
    }
  }

  return makeMiddleware(setup.bind(this))
}

Multer.prototype.single = function (name) {
  return this._makeMiddleware([{ name: name, maxCount: 1 }], 'VALUE')
}

Multer.prototype.array = function (name, maxCount) {
  return this._makeMiddleware([{ name: name, maxCount: maxCount }], 'ARRAY')
}

Multer.prototype.fields = function (fields) {
  return this._makeMiddleware(fields, 'OBJECT')
}

Multer.prototype.none = function () {
  return this._makeMiddleware([], 'NONE')
}

Multer.prototype.any = function () {
  function setup () {
    return {
      limits: this.limits,
      preservePath: this.preservePath,
      storage: this.storage,
      fileFilter: this.fileFilter,
      fileStrategy: 'ARRAY'
    }
  }

  return makeMiddleware(setup.bind(this))
}

function multer (options) {
  if (options === undefined) {
    return new Multer({})
  }

  if (typeof options === 'object' && options !== null) {
    return new Multer(options)
  }

  throw new TypeError('Expected object for argument options')
}

module.exports = multer
module.exports.diskStorage = diskStorage
module.exports.memoryStorage = memoryStorage
module.exports.MulterError = MulterError
