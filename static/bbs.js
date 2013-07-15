var bbsApp = angular.module('bbs', []);

bbsApp.config(function($routeProvider) {
	$routeProvider.
		when('/servers', {templateUrl: '/static/servers.html', controller: ServersCtrl}).
		otherwise({redirectTo: '/servers'});
});

bbsApp.factory('Servers', function() {
	var defaultServer = {
		url: "/bbs",
		name: "Default server"
	}
	var servers = [defaultServer];
	return {
		add: function(server) {
			servers.push(server);
		},
		list: function() {
			return servers;
		},
		refresh: function() {
			// do this
		}
	};
});

function ServersCtrl($scope, Servers) {
	$scope.servers = Servers.list();
}