'use strict';

/**
 * @ngdoc service
 * @name passmanApp.ShareService
 * @description
 * # ShareService
 * Service in the passmanApp.
 */
angular.module('passmanApp')
	.service('ShareService', ['$http', 'VaultService', 'EncryptService', function ($http, VaultService, EncryptService) {
		// Setup sjcl random engine to max paranoia level and start collecting data
		var paranoia_level = 10
		sjcl.random.setDefaultParanoia(paranoia_level);
		sjcl.random.startCollectors();

		return {
			search: function (string) {
				var queryUrl = OC.generateUrl('apps/passman/api/v2/sharing/search');
				return $http.post(queryUrl, {search: string}).then(function (response) {
					if (response.data) {
						return response.data;
					} else {
						return response;
					}
				});
			},
			getVaultsByUser: function (userId) {
				var queryUrl = OC.generateUrl('apps/passman/api/v2/sharing/vaults/'+ userId);
				return $http.get(queryUrl, {search: userId}).then(function (response) {
					if (response.data) {
						for (var i = 0; i < response.data.length; i++){
							response.data[i].public_sharing_key = forge.pki.publicKeyFromPem(response.data[i].public_sharing_key);
						}
						return response.data;
					} else {
						return response;
					}
				});
			},
			generateRSAKeys: function(key_length, progress, callback){
				var p = new C_Promise(function(){
					var state = forge.pki.rsa.createKeyPairGenerationState(key_length, 0x10001);
					var step = function() {
						// run for 100 ms
						if(!forge.pki.rsa.stepKeyPairGenerationState(state, 100)) {
							// console.log(state);
							if (state.p !== null) {
								// progress(50);
								this.call_progress(50);
							}
							else {
								// progress(0);
								this.call_progress(0);
							}
							setTimeout(step.bind(this), 1);
						}
						else {
							// callback(state.keys);
							this.call_then(state.keys);
						}
					};
					setTimeout(step.bind(this), 100);
				});
				return p;
			},
			generateSharedKey: function(size){
				size = size || 20;
				return new C_Promise(function(){
					var t = this;
					CRYPTO.PASSWORD.generate(size,
						function(pass) {
							t.call_then(pass);
						},
						function(progress) {
							t.call_progress(progress);
						}
					);
				})
			},
			rsaKeyPairToPEM: function(keypair){
				return {
					'publicKey' 	: forge.pki.publicKeyToPem(keypair.publicKey),
					'privateKey' 	: forge.pki.privateKeyToPem(keypair.privateKey)
				};
			},
			getSharingKeys: function(){
				var vault = VaultService.getActiveVault();
				return{
					'private_sharing_key': EncryptService.decryptString(angular.copy(vault.private_sharing_key)),
					'public_sharing_key': vault.public_sharing_key
				};
			},
			rsaPrivateKeyFromPEM: function(private_pem) {
				return forge.pki.privateKeyFromPem(private_pem);
			},
			rsaPublicKeyFromPEM: function(public_pem){
				return forge.pki.publicKeyFromPem(public_pem);
			},
			/**
			 * Cyphers an array of string in a non-blocking way
			 * @param vaults[] 	An array of vaults with the processed public keys
			 * @param string	The string to cypher
			 */
			cypherRSAStringWithPublicKeyBulkAsync: function(vaults, string){
				var workload = function(){
					if (this.current_index < this.vaults.length > 0 && this.vaults.length > 0) {
						this.data.push(
							forge.util.encode64(
								this.vaults[this.current_index].public_sharing_key.encrypt(this.string)
							)
						);
						this.current_index++;

						this.call_progress(this.current_index);
						setTimeout(workload.bind(this), 1);
					}
					else{
						this.call_then(this.data);
					}
				};
				return new C_Promise(function(){
					this.data = [];
					this.vaults = vaults;
					this.string = string;
					this.current_index = 0;

					setTimeout(workload.bind(this), 0);
				});
			}
		}
	}]);
