var bbsApp = angular.module('bbs', []);

bbsApp.run(function($rootScope) {
	$rootScope.currentServer = null;
});

bbsApp.config(function($routeProvider) {
	$routeProvider.
		when('/servers', {templateUrl: '/static/servers.html', controller: ServersCtrl}).
		when('/login', {templateUrl: '/static/login.html', controller: LoginCtrl}).
		when('/threads', {templateUrl: '/static/threads.html', controller: ThreadsCtrl}).
		otherwise({redirectTo: '/servers'});
});

function BBS(url, $http, $rootScope) {
	this.url = url;
	this.name = url;
	this.desc = "Pinging...";
	this.access = {};

	this.loggedIn = false;
	this.session = null;
	this.requiresLogin = false;

	var self = this;

	this.send = function(cmd) {
		$http.post(self.url, cmd).success(function(recv) {
			$rootScope.$broadcast("#" + recv.cmd, {
				server: self,
				data: recv,
				error: false
			});
		}).error(function(recv) {
			$rootScope.$broadcast("#" + recv.cmd, {
				server: self,
				data: recv,
				error: true
			});
		});
	}

	// update this bbs with data from "hello" cmd
	this.refresh = function(data) {
		self.name = data.name;
		self.desc = data.desc;
		self.access = data.access;
		self.lists = data.lists || [];

		if (self.access.user["get"] || self.access.user["list"]) {
			self.requiresLogin = true;
		}
	} 

	this.hello = function() {
		self.send({
			cmd: "hello"
		});
	}

	this.home = function() {
		if (self.requiresLogin && !self.loggedIn) {
			return "/login";
		}
		if (self.lists.indexOf("board") != -1) {
			return "/boards";
		}
		return "/list";
	}
}

bbsApp.factory('Servers', function($rootScope, $http) {
	var defaultServer = new BBS("/bbs", $http, $rootScope);
	var servers = {};
	servers[defaultServer.url] = defaultServer;

	var Servers = {
		add: function(server) {
			servers.push(new BBS(server, $http, $rootScope));
		},
		list: function() {
			var list = [];
			angular.forEach(servers, function(v, k) {
				list.push(v);
			});
			return list;
		},
		refresh: function() {
			angular.forEach(servers, function(srv) {
				srv.hello();
			});
		}
	};

	$rootScope.$on("#hello", function(nm, evt) {
		servers[evt.server.url].refresh(evt.data);
	});

	return Servers;
});

function ServersCtrl($rootScope, $scope, $location, Servers) {
	$scope.servers = Servers.list();
	
	$scope.refresh = function() {
		Servers.refresh();
	}

	$scope.select = function(srv) {
		$rootScope.currentServer = srv;
		$location.path(srv.home());
	}

	$scope.$on("#hello", function(type, evt) {
		$scope.servers = Servers.list();
	});

	$scope.refresh();
}

function LoginCtrl() {

}

function ThreadsCtrl() {
	
}