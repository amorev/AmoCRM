'use strict';
import Queue from 'promise-queue';
import qs from 'qs';

import HTTPRequest from '../common/HTTPRequest';
import DomainResponseHandler from '../../responseHandlers/DomainResponseHandler';
import EventResource from '../../EventResource';

class DomainRequest extends EventResource {
  static responseHandlerClass = DomainResponseHandler;
  static DEFAULT_USER_AGENT = 'amoCRM-API-client/1.0';

  constructor( domain ) {
    if ( !domain ) {
      throw new Error( 'Portal domain must be set!' );
    }
    super();
    this._queue = new Queue( 1 );
    this._cookies = [];
    this._hostname = domain.includes( '.' ) ? domain : domain + '.amocrm.ru';
  }

  clear() {
    this._cookies = [];
  }

  post( url, data = {}, options = {}) {
    return this.request( url, data, 'POST', options );
  }

  get( url, data = {}, options = {}) {
    return this.request( url, data, 'GET', options );
  }

  get expires() {
    return this._expires;
  }

  request( url, data = {}, method = 'GET', options = {}) {
    const encodedData = this.encodeData( url, data, method, options ),
      headers = this.getRequestHeaders( url, encodedData, method, options ),
      request = this.createRequest( url, encodedData, method, headers );
    return this.addRequestToQueue( request, options.response );
  }

  addRequestToQueue( request, options ) {
    return this._queue.add(() => {
      return request.send()
        .then( response => this.handleResponse( response, options ));
    });
  }

  encodeData( url, data = {}, method = 'GET', options = {}) {
    const isGET = method === 'GET';

    return isGET ? qs.stringify( data ) : JSON.stringify( data );
  }

  getDefaultHeaders( options ) {
    const withToken = options.withToken !== false,
      isJSON = options.json !== false,
      headers = {};

    if ( withToken && this._token ) {
      headers[ 'Authorization' ] = 'Bearer ' + this._token.access_token;
    }
    else if ( !withToken ) {
      headers[ 'Cookie' ] = this._cookies.join();
    }
    if ( isJSON && !headers[ 'Content-Type' ]) {
      headers[ 'Content-Type' ] = 'application/json';
    }

    return Object.assign({}, options.headers, headers );
  }

  getRequestHeaders(url, encodedData = '', method = 'GET', options = {}) {
    const isGET = method === 'GET',
      headers = this.getDefaultHeaders( options );

    if ( !isGET && encodedData ) {
      headers[ 'Content-Length' ] = Buffer.byteLength( encodedData );
    }
    return headers;
  }

  /**
   * @param {Array} token
   * @param {Date} tokenHandledAt
   */
  setToken( token, tokenHandledAt ) {
    const expiresIn = token.expires_in,
      responseTimestamp = new Date( tokenHandledAt ) / 1000,
      expiresTimestamp = responseTimestamp + expiresIn,
      expires = new Date( expiresTimestamp * 1000 );
    this._expires = expires;
    this._token = token;
  }

  getToken() {
    return this._token;
  }

  setCookies( cookies ) {
    this._cookies = cookies;
    const expiresCookie = cookies.find( cookie => cookie.includes( 'expires=' ));

    if ( !expiresCookie ) {
      delete this._expires;
      this.triggerEvent( 'expires', this );
      return;
    }

    const expires = expiresCookie.split( '; ' )
      .find( cookie => cookie.startsWith( 'expires=' ));

    if ( !expires ) {
      delete this._expires;
      this.triggerEvent( 'expires', this );
      return;
    }

    this._expires = new Date( expires.replace( 'expires=', '' ));
  }

  handleResponse({ rawData, response }, options = {}) {
    const { responseHandlerClass } = this.constructor;
    if ( options.saveCookies && response.headers[ 'set-cookie' ]) {
      this.setCookies( response.headers[ 'set-cookie' ]);
    }
    const handler = new responseHandlerClass( rawData, response );
    return handler.toJSON( options );
  }

  createRequest(url, encodedData = '', method = 'GET', headers = {}) {
    const isGET = method === 'GET',
      path = isGET ? `${url}?${encodedData}`: url;

    return new HTTPRequest({
      path,
      hostname: this._hostname,
      headers,
      method,
      data: encodedData,
      secure: true
    });
  }
}

export default DomainRequest;
