const fs = require('fs');
const path = require('path');

const PDFDocument = require('pdfkit');
const stripe = require('stripe')(process.env.STRIPE_KEY);
const Product = require('../models/product');
const Order = require('../models/order');

const ITEMS_PER_PAGE = 1;

exports.getProducts = (req, res, next) => {
  const page = req.query.page || 1;
  let totalItems;

  Product.find()
  .countDocuments()
  .then(numProducts => {
    totalItems = numProducts;
    return Product.find().skip((page-1) * ITEMS_PER_PAGE).limit(ITEMS_PER_PAGE);
  })
  .then(products => {
    res.render('shop/product-list', {
      prods: products,
      pageTitle: 'All Products',
      path: '/products',
      totalProducts: totalItems,
      currentPage: +page,
      hasNextPage: ITEMS_PER_PAGE * +page < totalItems,
      hasPreviousPage: +page > 1,
      nextPage: +page + 1,
      previousPage: +page - 1,
      lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
    });
  })
  .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
  .then(product => {
    res.render('shop/product-detail', {
      product: product,
      pageTitle: product.title,
      path: '/products'
    });
  })
  .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.getIndex = (req, res, next) => {
  const page = req.query.page || 1;
  let totalItems;

  Product.find()
  .countDocuments()
  .then(numProducts => {
    totalItems = numProducts;
    return Product.find().skip((page-1) * ITEMS_PER_PAGE).limit(ITEMS_PER_PAGE);
  })
  .then(products => {
    res.render('shop/index', {
      prods: products,
      pageTitle: 'Shop',
      path: '/',
      totalProducts: totalItems,
      currentPage: +page,
      hasNextPage: ITEMS_PER_PAGE * +page < totalItems,
      hasPreviousPage: +page > 1,
      nextPage: +page + 1,
      previousPage: +page - 1,
      lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
    });
  })
  .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }); 
};

exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      products = user.cart.items;
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products: products
      });
    })
    .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId).then(product => {
    return req.user.addToCart(product)
  }).then(result => {
    res.redirect('/cart');
  })
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then(result => {
      res.redirect('/cart');
    })
    .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.getCheckout = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      products = user.cart.items;
      let total = 0;
      products.map(prod => {
        total += prod.quantity * prod.productId.price;
      })
      res.render('shop/checkout', {
        path: '/checkout',
        pageTitle: 'Checkout',
        products: products,
        totalSum: total.toFixed(2)
      });
    })
    .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.postOrder = async (req, res, next) => {
  const token = req.body.stripeToken;
  totalSum = 0;
  
  req.user
  .populate('cart.items.productId')
  .execPopulate()
  .then(user => {
    user.cart.items.map(prod => {
      totalSum += prod.quantity * prod.productId.price;
    })
    products = user.cart.items.map(item => {
      return { quantity: item.quantity, product: { ...item.productId._doc } }
    });
    let order = new Order({
      products,
      user: {
        email: req.user.email,
        userId: req.user,
      }
    });
    return order.save();
  })
  .then(result => {
    const charge = stripe.charges.create({
      amount: +totalSum.toFixed(2) * 100,
      currency: 'inr',
      description: 'Demo Order',
      source: token,
      metadata: {order_id: result._id.toString()}
    });
    return req.user.clearCart();
  })
  .then(() => {
    res.redirect('/orders');
  })
  .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.getOrders = (req, res, next) => {
  Order.find({"user.userId": req.user._id})
    .then(orders => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders: orders
      });
    })
    .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findById(orderId)
  .then(order => {
    if (!order) {
      return next(new Error('No Error Found'));
    }
    if (order.user.userId.toString() !== req.user._id.toString()) {
      return next(new Error('Unauthorized'));
    }
    const invoiceName = `invoice-${orderId}.pdf`;
    const invoicePath = path.join('data', 'invoices', invoiceName);

    const pdfDoc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + invoiceName +'"');

    pdfDoc.pipe(fs.createWriteStream(invoicePath));
    pdfDoc.pipe(res);
    pdfDoc.fontSize(26).text('Invoice', {
      underline: true,
      align: 'center'
    });
    pdfDoc.text('---------------------------', {
      align: 'center'
    });
    let totalPrice = 0;
    order.products.forEach(prod => {
      totalPrice += prod.quantity * prod.product.price;
      pdfDoc.fontSize(14).text(`${prod.product.title} - ${prod.quantity} * $${prod.product.price}`, {
        align: 'center'
      });
    })
    pdfDoc.text('-----', {
      align: 'center'
    })
    pdfDoc.fontSize(20).text(`Total Price: $${totalPrice}`, {
      align: 'center'
    });

    pdfDoc.end();

    // fs.readFile(invoicePath, (err, data) => {
    //   if (err) {
    //     return next(err);
    //   }
    //   res.setHeader('Content-Type', 'application/pdf');
    //   res.setHeader('Content-Disposition', 'attachment; filename="' + invoiceName +'"');
    //   res.send(data);
    // });
    // const file = fs.createReadStream(invoicePath);
    // file.pipe(res);
  })
  .catch(err => next(err));
};
