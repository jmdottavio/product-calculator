import $ from 'jquery';
import Backbone from 'Backbone';
import _ from 'underscore';

window.$ = $;
window.Backbone = Backbone;
window._ = _;
window.lrp = {};

lrp = {
	Functions: {},
	Models: {},
	Collections: {},
	Views: {},
	Router: null
}

// Models

// Product Model
lrp.Models.Product = Backbone.Model.extend({
	defaults: {
		id: null,
		name: '',
		category: '',
		price: 0.00
	}
});

// Line Model
lrp.Models.Line = Backbone.Model.extend({
	defaults: {
		id: null,
		product: null,
		price: 0.00,
		quantity: 1,
		extendedPrice: 0.00,
		delete:0
	},

	initialize: function() {
		this.on('change:price', this.calculate);
		this.on('change:quantity', this.calculate);

		return this;
	},

	calculate: function() {
		this.set('extendedPrice', this.get('price')*this.get('quantity'));

		return this;
	}
});

// Order Model
lrp.Models.Order = Backbone.Model.extend({
	defaults: {
		id: null,
		lines: []
	},

	initialize: function() {
		this.set({lines: new lrp.Collections.Line()});

		return this;
	}
});

// Calculator Model
lrp.Models.Calculator = Backbone.Model.extend({
	defaults: {
		order: null,
		subtotal: 0.00,
		feeAmount: 0.00,
		salesTaxAmount: 0.00,
		total: 0.00,
		chargeFee: true,
		chargeSales: true
	},

	initialize: function() {
		_.bindAll(this, 'calculate');

		this.set({order: new lrp.Models.Order()});

		this.lines = this.get('order').get('lines');
		this.lines.on('change:extendedPrice remove', this.calculate);

		return this;
	},

	calculate: function() {
		var subtotal = 0;

		_.each(this.lines.models, function(line) {
			subtotal += line.get('extendedPrice');
		});

		var fee = 0;

		if ( this.get('chargeFee') ) {
			fee = Number(subtotal) * 0.04;
		}

		var salesTax = 0;

		if ( this.get('chargeSales') ) {
			salesTax = Number(subtotal+fee) * 0.08;
		} 

		var total = subtotal + fee + salesTax;

		this.set({
			subtotal:subtotal,
			feeAmount:fee,
			salesTaxAmount:salesTax,
			total:total
		});

		return this;
	}
});

// Collections

// Product Collection - holds the list of all products
lrp.Collections.Product = Backbone.Collection.extend({
	model: lrp.Models.Product,

	url: '/data/products.json',

	parse: function(data) {
		return data.products;
	}
});

// Line Collection - holds the list of all lines for this order
lrp.Collections.Line = Backbone.Collection.extend({
	model: lrp.Models.Line
});


// Views

// Product Option View - option for product selector based on product model
lrp.Views.ProductOption = Backbone.View.extend({
	tagName: 'option',

	template: _.template($('#option-template').html()),

	initialize: function(options) {
		this.options = options || {};

		this.model = this.options.model;

		return this;
	},

	render: function() {
		this.el = this.template(this.model.toJSON());

		return this;		
	}
});

// Product Selector View - selector for products based on product collection
lrp.Views.ProductSelector = Backbone.View.extend({
	tagName: 'select',

	className: 'line_product_select',

	events: {'change':'updateSelected'},

	initialize: function(options) {
		this.options = options || {};

		this.productCollection = this.options.productCollection;

		return this;
	},

	render: function() {
		this.$el.append('<option disabled selected value="">Select Product...</option>');

		_.each(this.productCollection.models, function(product) {
			var productOptionView = new lrp.Views.ProductOption({model:product});
			this.$el.append(productOptionView.render().el);
		}, this);

		return this;
	},

	updateSelected: function() {
		var newProductID = this.$el.val();
		var newProduct = this.productCollection.get(newProductID);

		this.trigger('change:selected', newProduct);
	}
});

// Line View
lrp.Views.Line = Backbone.View.extend({
	tagName: 'li',
	className: 'columns lrp-order_line',

	template: _.template($('#line-template').html()),

	events: {
		'click .line_delete': 'destroy'
	},

	initialize: function(options) {
		this.options = options || {};

		this.model = this.options.model;

		//clone so each line refers to a unique collection
		this.productCollection = _.clone(this.options.productCollection);

		this.productSelector = new lrp.Views.ProductSelector({
			productCollection: this.productCollection
		});

		this.listenTo(this.productSelector, 'change:selected', this.updatePrice);
		this.listenTo(this.model, 'change:extendedPrice', this.refreshValues);

		return this;
	},

	updatePrice: function(newProduct) {
		this.model.set('price', newProduct.get('price'));
	},

	refreshValues: function() {
		var price = this.model.get('price');
		this.$price.html(price);

		var quantity = this.model.get('quantity');
		this.$quantity.html(quantity);

		var extendedPrice = this.model.get('extendedPrice');
		this.$extendedPrice.html(extendedPrice);
	},

	render: function() {
		this.$el.html(this.template(this.model.toJSON()));

		var productSelectorRendered = this.productSelector.render();
		this.$el.find('.line_product').append(productSelectorRendered.el);

		//can only assign after render due to templating
		this.$price = this.$el.find('.line_price');
		this.$quantity = this.$el.find('.line_quantity');
		this.$extendedPrice = this.$el.find('.line_extended-price');

		return this;
	},

	destroy: function() {
		this.model.set('delete', 1);
		this.remove();
	}
});

// Order View - holds each line
lrp.Views.Order = Backbone.View.extend({
	el: '.app_order',

	template: _.template($('#order-template').html()),

	events: {
		'click .add-line': 'addLine'
	},

	initialize: function(options) {
		this.options = options || {};
		this.model = this.options.model;
		this.lines = this.model.get('lines');

		this.listenTo(this.lines, 'add', this.addLineView);
		this.listenTo(this.lines, 'change:delete', this.removeLine);

		this.productCollection = new lrp.Collections.Product;
		this.productCollection.fetch({
			success: function() {
				$('.add-line').trigger('click');
			}
		});
		
		return this;
	},

	render: function() {
		this.$el.append(this.template());

		//have to assign after render for it to exist
		this.$lineList = this.$el.find('.lrp-order');

		return this;
	},

	addLine: function() {
		var newLineModel = new lrp.Models.Line();

		this.lines.add(newLineModel);
	},

	addLineView: function(line) {
		var newLineView = new lrp.Views.Line({
			model:line, 
			productCollection: this.productCollection
		});

		this.$lineList.append(newLineView.render().el);
	},

	removeLine: function(line) {
		this.lines.remove(line);
	}
});

// Calculator View
lrp.Views.Calculator = Backbone.View.extend({
	el: '#app',

	initialize: function() {
		this.model = new lrp.Models.Calculator();

		//child views
		this.orderView = new lrp.Views.Order({model: this.model.get('order')});

		//elements
		this.$orderContainer = $('.app_order');
		this.$subtotal = $('.app_subtotal').find('.calculator_amount');
		this.$fee = $('.app_fee').find('.calculator_amount');
		this.$salesTax = $('.app_sales-tax').find('.calculator_amount');
		this.$total = $('.app_total').find('.calculator_amount');

		_.bindAll(this, 'refreshValues');

		this.model.on('change:total', this.refreshValues);

		this.render();

		return this;
	},

	render: function() {
		this.orderView.render();

		this.$orderContainer.append(this.orderView.el);

		return this;
	},

	refreshValues: function() {
		this.$subtotal.html(this.model.get('subtotal').toFixed(2));
		this.$fee.html(this.model.get('feeAmount').toFixed(2));
		this.$salesTax.html(this.model.get('salesTaxAmount').toFixed(2));
		this.$total.html(this.model.get('total').toFixed(2));
	}
});

(function() {
	'use strict';

	new lrp.Views.Calculator();
})();