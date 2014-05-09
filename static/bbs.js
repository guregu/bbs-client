var bbsApp = angular.module('bbs', []);

bbsApp.run(function($rootScope) {
	$rootScope.currentServer = null;
	$rootScope.loginRedirect = null;
});

bbsApp.config(function($routeProvider) {
	$routeProvider.
		when('/servers', {templateUrl: '/static/servers.html', controller: ServersCtrl}).
		when('/login', {templateUrl: '/static/login.html', controller: LoginCtrl}).
		when('/logout', {templateUrl: '/static/logout.html', controller: LogoutCtrl}).
		when('/home', {templateUrl: '/static/home.html', controller: HomeCtrl}).
		when('/threads', {templateUrl: '/static/threads.html', controller: ThreadsCtrl}).
		when('/threads/:query', {templateUrl: '/static/threads.html', controller: ThreadsCtrl}).
		when('/get/:id', {templateUrl: '/static/thread.html', controller: ThreadCtrl}).
		when('/get/:id/:filter', {templateUrl: '/static/thread.html', controller: ThreadCtrl}).
		when('/reply/:id', {templateUrl: '/static/reply.html', controller: ReplyCtrl}).
		when('/post', {templateUrl: '/static/post.html', controller: PostCtrl}).
		when('/register', {templateUrl: '/static/register.html', controller: RegisterCtrl}).
		otherwise({redirectTo: '/servers'});
});

bbsApp.factory('BBS', function($http, $rootScope, $location) {
	return function(url) {
		this.url = url;
		this.name = url;
		this.desc = "Pinging...";
		this.access = {};
		this.lists = [];
		this.options = [];
		this.formats = [];
		this.bookmarks = [];

		this.wsURL = null;
		this.realtime = false;
		this.socket = null;
		this.sendQueue = [];

		this.loggedIn = false;
		this.username = null;
		this.session = null;
		this.requiresLogin = false;

		var self = this;

		this.connect = function() {
			self.realtime = true;
			self.socket = new WebSocket(self.wsURL);
			self.socket.onopen = function() {
				console.log("Realtime: connected.");

				angular.forEach(self.sendQueue, function(msg) {
				    self.send(msg);
				});
				self.sendQueue = [];
			};
			self.socket.onclose = function() {
				console.log("Realtime: disconnected.");
			};
			self.socket.onerror = function (error) {
			    console.log(error);
			};
			self.socket.onmessage = function(evt) {
				var data = angular.fromJson(evt.data);
				self.receive(data, true);
			};
		}

		this.send = function(cmd) {
			// websocket sends
			if (self.realtime) {
				if (self.socket && self.socket.readyState == 1) {
					self.socket.send(angular.toJson(cmd));
				} else {
					self.sendQueue.push(cmd);
				}
				return;
			}

			// http sends
			if (self.session) {
				cmd.session = self.session;
			}
			$http.post(self.url, cmd).success(function(recv) {
				self.receive(recv);
			});
		}

		this.receive = function(data, apply) {
			if (data.cmd != "error") {
				$rootScope.$broadcast("#" + data.cmd, {
					server: self,
					data: data
				});
			} else {
				console.log("error: " + data.wrt);
				$rootScope.$broadcast("!" + data.wrt, {
					server: self,
					data: data
				});
			}
			if (apply) {
				$rootScope.$apply();
			}
		}

		// update this bbs with data from "hello" cmd
		this.refresh = function(data) {
			console.log(data);
			self.name = data.name;
			self.desc = data.desc;
			self.access = data.access;
			self.lists = data.lists || [];
			self.options = data.options;
			self.formats = data.format || ["text"];
			self.defaultFormat = self.formats[0];
			self.wsURL = data.realtime;

			if (self.access.user && self.access.user["get"] || self.access.user["list"]) {
				self.requiresLogin = true;
			}

			if (self.wsURL) {
				self.connect();
			}
		} 

		this.serialize = function() {
			return angular.toJson({
				url: self.url,
				name: self.name,
				desc: self.desc,
				access: self.access,
				lists: self.lists,
				options: self.options,
				bookmarks: self.bookmarks,
				formats: self.formats,
				session: self.session,
				loggedIn: self.loggedIn,
				requiresLogin: self.requiresLogin,
				username: self.username,
				wsURL: self.wsURL
			});
		}

		this.deserialze = function(b) {
			self.url = b.url;
			self.name = b.name;
			self.desc = b.desc;
			self.access = b.access;
			self.lists = b.lists;
			self.options = b.options;
			self.formats = b.formats;
			self.defaultFormat = b.formats[0];
			self.bookmarks = b.bookmarks;
			self.session = b.session;
			self.loggedIn = b.loggedIn;
			self.requiresLogin = b.requiresLogin;
			self.username = b.username;
			self.wsURL = b.wsURL;

			if (self.wsURL) {
				self.connect();
			}
		}

		this.supports = function(opt) {
			return self.options.indexOf(opt) != -1;
		}

		this.guestsCan = function(cmd) {
			return self.access.guest.indexOf(cmd) != -1;
		}

		this.usersCan = function(cmd) {
			return self.access.user.indexOf(cmd) != -1;
		}

		this.can = function(cmd) {
			return (self.guestsCan(cmd) || self.usersCan(cmd));
		}

		this.hello = function() {
			self.send({
				cmd: "hello"
			});
		}

		this.login = function(username, password) {
			self.send({
				cmd: "login",
				username: username,
				password: password,
				version: 0
			});
		}

		this.register = function(u, p) {
			self.send({
				cmd: "register",
				username: u,
				password: p
				});
		}

		this.logout = function() {
			if (self.loggedIn) {
				self.send({
					cmd: "logout"
				});
			}	
			self.loggedIn = false;
			self.session = false;
			self.username = null;
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

		this.get = function(id, token, filter, format) {
			var cmd = {
				cmd: "get",
				id: id,
				format: format || self.defaultFormat
			}
			if (token) {
				cmd.token = token;
			}
			if (filter) {
				cmd.filter = filter;
			}
			console.log(cmd);
			self.send(cmd);
		}

		this.reply = function(id, body, format) {
			var cmd = {
				cmd: "reply",
				to: id,
				body: body,
				format: format
			};
			self.send(cmd);
		}

		this.post = function(title, body, format, tags) {
			var cmd = {
				cmd: "post",
				title: title,
				body: body,
				format: format
			};
			if (tags) {
				cmd.tags = tags;
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

		// our log-in is bad
		$rootScope.$on("!session", function(nm, evt) {
			console.log(self);
			if (evt.server == self) {
				self.loggedIn = false;
				self.session = null;
				$rootScope.loginRedirect = $location.path();
				$location.path("/login");
			}
		});

		$rootScope.$on("#list", function(nm, evt) {
			if (evt.server == self && evt.data.type == "bookmark") {
				console.log("BOOKAMEKS");
				console.log(evt.data);
				if (evt.data.bookmarks && evt.data.bookmarks.length > 0) {
					self.bookmarks = evt.data.bookmarks;
				}
				localStorage["current"] = self.serialize();
			}
		});

		$rootScope.$on("#welcome", function(nm, evt) {
			if (evt.server == self) {
				self.loggedIn = true;
				self.session = evt.data.session;
				self.username = evt.data.username;

				if (self == $rootScope.currentServer) {
					localStorage["current"] = self.serialize();
				}

				self.list("bookmark");
			}
		});
	}
});

bbsApp.factory('Servers', function($rootScope, BBS) {
//	var defaultServer = new BBS("/bbs", $http, $rootScope, $location);
	var servers = {};
//	servers[defaultServer.url] = defaultServer;

	var Servers = {
		add: function(url) {
			servers[url] = new BBS(url);
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

bbsApp.directive('markdown', function() {
  marked.setOptions({
    gfm: true,
    tables: true,
    breaks: true,
    pedantic: false,
    sanitize: true,
    smartLists: true,
    smartypants: false
  });
 	return {
	    restrict: 'E',
	    require: '?ngModel',

        link: function(scope, element, attrs, model) {
        	var render = function() {
	        	var txt = "";
	        	if (attrs['ngModel']) {
	        		if (model.$modelValue) {
	 					txt = model.$modelValue;
	        		}
	        	} else {
	        		txt = element.text();
	        	}
	        	var htmlText = marked(txt);
	            element.html(htmlText);
	        }

        	if (attrs['ngModel']) {
                scope.$watch(attrs['ngModel'], render);
            }

            render();
        }
    }
});

bbsApp.run(function ($rootScope, Servers) {
	Servers.add("/bbs");
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

	$scope.logout = function() {
		$rootScope.currentServer.logout();
		$rootScope.currentServer = null;
		delete localStorage["current"];
	}

	$scope.$on("#hello", function(type, evt) {
		if (!evt.error) {
			$scope.servers = Servers.list();
		}
	});

	$scope.refresh();
}

function LogoutCtrl($rootScope, $location) {
	if ($rootScope.currentServer) {
		$rootScope.currentServer.logout();
		$rootScope.currentServer = null;
		delete localStorage["current"];
	}
	$location.path("/servers");
}

function LoginCtrl($rootScope, $scope, $location) {
	$scope.error = null;
	$scope.username = "";
	$scope.password = "";

	$scope.login = function() {
		$rootScope.currentServer.login($scope.username, $scope.password);
	}

	$scope.$on("#welcome", function(nm, evt) {
		if ($rootScope.loginRedirect) {
			$location.path($rootScope.loginRedirect);
			$rootScope.loginRedirect = null;
		} else {
			$location.path(evt.server.home());
		}
	});

	$scope.$on("!login", function(nm, evt) {
		console.log(evt);
		$scope.error = evt.data.msg;
	});
}

function HomeCtrl($rootScope, $location, $scope) {
	$scope.logout = function() {
		$rootScope.currentServer.logout();
	}

	$scope.disconnect = function() {
		$rootScope.currentServer.logout();
		$rootScope.currentServer = null;
		delete localStorage["current"];
		$location.path('/servers');
	}

	if (!$rootScope.currentServer) {
		$location.path('/servers');
	}
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

	$scope.dangerous = function(tag) {
		var danger = ["NWS", "NLS", "Spoilers"];
		return danger.indexOf(tag) != -1;
	}

	$scope.view = function(thread) {
		$location.path("/get/" + thread.id);
	}

	$scope.$on("#list", function(nm, evt) {
		console.log(evt);
		if (evt.data.threads) {
			$scope.threads = $scope.threads.concat(evt.data.threads);
			$scope.next = evt.data.next || null;
			//console.log(evt);
		}
	});

	$scope.$on("!list", function(nm, evt) {
		console.log(evt);
		$scope.error = evt.data.error;
	});

	if (!$rootScope.currentServer) {
		$location.path("/servers");
	} else {
		$rootScope.currentServer.list("thread", $scope.query);
	}
}

function ThreadCtrl($rootScope, $scope, $routeParams, $location) {
	$scope.error = null;

	$scope.id = $routeParams.id;
	$scope.title = null;
	$scope.closed = false;
	$scope.filter = $routeParams.filter || null;
	$scope.tags = null;
	$scope.format = null;
	$scope.messages = [];
	$scope.next = null;

	$scope.pushMessages = function(msgs) {
		// TODO: don't blindly concat, instead keep an index of msgids
		$scope.messages = $scope.messages.concat(msgs);
	}

	$scope.loadMore = function() {
		$rootScope.currentServer.get($scope.id, $scope.next, $scope.filter);
	}

	$scope.reply = function() {
		// TODO: make modal instead of redirect
		$location.path("/reply/" + $scope.id);
	}

	$scope.$on("#msg", function(nm, evt) {
		if (evt.data.id == $scope.id) {
			console.log(evt);
			$scope.title = evt.data.title;
			$scope.closed = evt.data.closed;
			$scope.filter = evt.data.filter;
			$scope.tags = evt.data.tags || null;
			$scope.format = evt.data.format;
			$scope.next = evt.data.next || null;

			$scope.pushMessages(evt.data.messages);
		}
	});

	$scope.$on("!msg", function(nm, evt) {
		if (evt.data.id == $scope.id) {
			$scope.error = evt.data.error;
		}
	});

	if (!$rootScope.currentServer) {
		$location.path("/servers");
	} else {
		$rootScope.currentServer.get($scope.id, $scope.next, $scope.filter);
	}
}

function ReplyCtrl($rootScope, $scope, $routeParams, $location) {
	$scope.id = $routeParams.id;
	$scope.error = null;
	$scope.body = "";
	$scope.format = "text";

	$scope.submit = function() {
		console.log("submitting...");
		$rootScope.currentServer.reply($scope.id, $scope.body, $scope.format);
	}

	$scope.$on("#ok", function(nm, evt) {
		if (evt.data.wrt == "reply") {
			$location.path("/get/" + $scope.id);
		}
	});

	$scope.$on("!reply", function(nm, evt) {
		$scope.error = evt.data.error;
	});
}

function PostCtrl($rootScope, $scope, $location) {
	$scope.error = null;
	$scope.title = null;
	$scope.body = "";
	$scope.format = "text";

	$scope.submit = function() {
		$rootScope.currentServer.post($scope.title, $scope.body, $scope.format);
	}

	$scope.$on("#ok", function(nm, evt) {
		if (evt.data.wrt == "post") {
			$location.path("/get/" + evt.data.result);
		}
	});

	$scope.$on("!post", function(nm, evt) {
		$scope.error = evt.data.error;
	});
}

function RegisterCtrl($rootScope, $scope, $location) {
        $scope.error = null;
        $scope.username = "";
        $scope.password = "";

        $scope.submit = function() {
                $rootScope.currentServer.register($scope.username, $scope.password);
        }

        $scope.$on("#ok", function(nm, evt) {
		console.log(evt);
		if (evt.data.wrt == "register") {
	        	$rootScope.currentServer.login($scope.username, $scope.password);
				$location.path($rootScope.currentServer.home())
          	}
        });

        $scope.$on("!register", function(nm, evt) {
                console.log(evt);
                $scope.error = evt.data.msg;
        });
}	
