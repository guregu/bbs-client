var bbsApp = angular.module('bbs', []);

bbsApp.run(function($rootScope) {
	$rootScope.currentServer = null;
});

bbsApp.config(function($routeProvider) {
	$routeProvider.
		when('/servers', {templateUrl: '/static/servers.html', controller: ServersCtrl}).
		when('/login', {templateUrl: '/static/login.html', controller: LoginCtrl}).
		when('/threads', {templateUrl: '/static/threads.html', controller: ThreadsCtrl}).
		when('/threads/:query', {templateUrl: '/static/threads.html', controller: ThreadsCtrl}).
		otherwise({redirectTo: '/servers'});
});

function BBS(url, $http, $rootScope) {
	this.url = url;
	this.name = url;
	this.desc = "Pinging...";
	this.access = {};
	this.lists = [];

	this.loggedIn = false;
	this.session = null;
	this.requiresLogin = false;

	var self = this;

	this.send = function(cmd) {
		if (self.session) {
			cmd.session = self.session;
		}
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

	this.serialize = function() {
		return angular.toJson({
			url: self.url,
			name: self.name,
			desc: self.desc,
			access: self.access,
			lists: self.lists,
			session: self.session,
			loggedIn: self.loggedIn,
			requiresLogin: self.requiresLogin,
		});
	}

	this.deserialze = function(b) {
		self.url = b.url;
		self.name = b.name;
		self.desc = b.desc;
		self.access = b.access;
		self.lists = b.lists;
		self.session = b.session;
		self.loggedIn = b.loggedIn;
		self.requiresLogin = b.requiresLogin;
	}

	this.hello = function() {
		self.send({
			cmd: "hello"
		});
	}

	this.list = function(type, query, token) {
		var cmd = {
			cmd: "list",
			type: type,
		};
		if (query) {
			cmd.query = query;
		}
		if (token) {
			cmd.token = token;
		}
		self.send(cmd);
	}

	this.home = function() {
		if (self.requiresLogin && !self.loggedIn) {
			return "/login";
		}
		if (self.lists.indexOf("board") != -1) {
			return "/boards";
		}
		return "/threads";
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
		get: function(url) {
			return servers[url];
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

bbsApp.filter('ago', function() {
	return function(input) {
		return moment(input).fromNow();
	}
})

bbsApp.run(function ($rootScope, Servers) {
	if (localStorage["current"]) {
		var data = angular.fromJson(localStorage["current"]);
		var srv = Servers.get(data.url);
		srv.deserialze(data);
		$rootScope.currentServer = srv;
	}
});

function ServersCtrl($rootScope, $scope, $location, Servers) {
	$scope.servers = Servers.list();
	
	$scope.refresh = function() {
		Servers.refresh();
	}

	$scope.select = function(srv) {
		$rootScope.currentServer = srv;
		localStorage["current"] = srv.serialize();
		$location.path(srv.home());
	}

	$scope.$on("#hello", function(type, evt) {
		$scope.servers = Servers.list();
	});

	$scope.refresh();
}

function LoginCtrl() {

}

function ThreadsCtrl($rootScope, $scope, $location, $routeParams) {
	$scope.threads = [];
	$scope.error = null;
	$scope.query = $routeParams.query || null;
	$scope.next = null;

	$scope.loadMore = function() {
		if ($scope.next) {
			$rootScope.currentServer.list("thread", $scope.query, $scope.next);
		}
	}

	$scope.$on("#list", function(nm, evt) {
		if (!evt.error && evt.data.threads) {
			$scope.threads = $scope.threads.concat(evt.data.threads);
			$scope.next = evt.data.next || null;
		} else {
			$scope.error = evt.data.msg;
		}
	});

	if (!$rootScope.currentServer) {
		$location.path("/servers");
	} else {
		$rootScope.currentServer.list("thread", $scope.query);
	}
}